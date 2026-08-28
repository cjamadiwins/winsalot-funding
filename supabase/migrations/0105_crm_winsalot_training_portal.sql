-- Growth CRM: Generic Winsalot Training Portal.
--
-- A brand-new, fully additive training system for the *generic* Winsalot
-- Corp. curriculum (contacting businesses on Winsalot's behalf) - kept
-- entirely separate from crm_training_materials (migration 0018, "Sales
-- Training & Call Scripts" - a free-form reference library of call
-- scripts) and from the leadgen_* client-campaign training content
-- (Mantra Collab, Brent's Essentials) - neither of those is touched here.
-- Client-campaign training is explicitly out of scope and will be added
-- separately later.
--
-- Five tables, matching the brief's own list:
--   1. crm_training_modules            - one row per module (metadata only)
--   2. crm_training_module_versions    - versioned content snapshots
--   3. crm_training_module_assignments - which role a module is assigned to
--   4. crm_training_progress           - per-user open/complete tracking
--   5. crm_training_admin_actions      - admin audit log (create/edit/
--                                        reorder/activate/deactivate/reset)
--
-- Versioning model: crm_training_modules.current_version always points at
-- the version whose content agents currently see. A minor edit (typo fix,
-- wording tweak) updates the existing version row's content in place - no
-- version bump, so nobody's completion is affected. A major revision
-- inserts a *new* crm_training_module_versions row and bumps
-- current_version, leaving the old version row (and therefore anyone's
-- completion recorded against it) completely untouched - "editing a
-- module must not silently erase historical completion records."
-- crm_training_progress is keyed on (user_id, module_id, module_version),
-- so a user's completion of version 1 is a permanently separate row from
-- their (possibly still-incomplete) status on version 2 - this is what
-- "require users to complete the revised version again" means in
-- practice, with zero data loss.
--
-- Reuses the existing crm_users/crm_user_role() role system exactly as
-- every other Growth CRM table does - no new auth mechanism, no service-
-- role access from browser code.

-- ---------------------------------------------------------------------
-- crm_training_modules
-- ---------------------------------------------------------------------
create table if not exists public.crm_training_modules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,
  updated_by uuid references public.crm_users(id) on delete set null,

  slug text not null unique,
  title text not null,
  sort_order int not null default 0,

  -- "Mark modules as required or optional" / "Activate or deactivate
  -- modules." A module starts inactive (a draft) so an admin can preview
  -- it before publishing - agents only ever see is_active = true modules.
  is_required boolean not null default true,
  is_active boolean not null default false,

  -- Always equal to the highest version number in
  -- crm_training_module_versions for this module - the version whose
  -- content is currently shown to agents.
  current_version int not null default 1
);

create index if not exists crm_training_modules_sort_idx on public.crm_training_modules(sort_order);

alter table public.crm_training_modules enable row level security;

create policy "crm_training_modules_admin_all" on public.crm_training_modules for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- The agent-select policy on this table (crm_training_modules_agent_
-- select_assigned) is created further down, after
-- crm_training_module_assignments exists - it references that table.

create or replace function public.crm_training_modules_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_training_modules_set_updated_at
  before update on public.crm_training_modules
  for each row execute function public.crm_training_modules_set_updated_at();

-- ---------------------------------------------------------------------
-- crm_training_module_assignments - which role a module is assigned to.
-- Today every module is assigned to 'agent' (admins can already read and
-- manage every module regardless of assignment, per the brief's "Open
-- and read every training module") - modeled as its own table rather
-- than a column so a future per-agent or additional-role assignment
-- never requires a schema change. Created before
-- crm_training_module_versions and before crm_training_modules' own
-- agent-select policy, since both reference this table.
-- ---------------------------------------------------------------------
create table if not exists public.crm_training_module_assignments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.crm_training_modules(id) on delete cascade,
  assigned_role text not null check (assigned_role in ('agent')),
  created_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  unique (module_id, assigned_role)
);

alter table public.crm_training_module_assignments enable row level security;

create policy "crm_training_module_assignments_admin_all" on public.crm_training_module_assignments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Low-sensitivity metadata (just "module X is assigned to role Y") - any
-- active CRM member may read it, same convention as
-- crm_training_materials_select_members (migration 0018).
create policy "crm_training_module_assignments_select_members" on public.crm_training_module_assignments for select
  using (public.crm_user_role(auth.uid()) is not null);

-- "Agents may only read active modules assigned to them."
create policy "crm_training_modules_agent_select_assigned" on public.crm_training_modules for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and is_active = true
    and exists (
      select 1 from public.crm_training_module_assignments a
      where a.module_id = crm_training_modules.id and a.assigned_role = 'agent'
    )
  );

-- ---------------------------------------------------------------------
-- crm_training_module_versions
-- ---------------------------------------------------------------------
create table if not exists public.crm_training_module_versions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.crm_training_modules(id) on delete cascade,
  version int not null,
  title text not null,
  -- { learningObjective, explanation, steps[], examples[], approvedPhrases[],
  --   phrasesToAvoid[], commonMistakes[], keyReminders[], summary } - see
  -- TrainingModuleContent in src/lib/crm-training-types.ts.
  content jsonb not null,
  is_major_revision boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.crm_users(id) on delete set null,

  unique (module_id, version)
);

create index if not exists crm_training_module_versions_module_idx on public.crm_training_module_versions(module_id, version desc);

alter table public.crm_training_module_versions enable row level security;

create policy "crm_training_module_versions_admin_all" on public.crm_training_module_versions for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_training_module_versions_agent_select_assigned" on public.crm_training_module_versions for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and exists (
      select 1 from public.crm_training_modules m
      join public.crm_training_module_assignments a on a.module_id = m.id
      where m.id = crm_training_module_versions.module_id
        and m.is_active = true
        and a.assigned_role = 'agent'
    )
  );

-- ---------------------------------------------------------------------
-- crm_training_progress - one row per user, per module, per version.
-- ---------------------------------------------------------------------
create table if not exists public.crm_training_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.crm_users(id) on delete cascade,
  module_id uuid not null references public.crm_training_modules(id) on delete cascade,
  module_version int not null,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, module_id, module_version),
  -- "A user must open a module before marking it complete" - enforced at
  -- the database level too, not just in application code.
  constraint crm_training_progress_open_before_complete check (completed_at is null or opened_at is not null)
);

create index if not exists crm_training_progress_user_idx on public.crm_training_progress(user_id);
create index if not exists crm_training_progress_module_idx on public.crm_training_progress(module_id);

alter table public.crm_training_progress enable row level security;

create policy "crm_training_progress_admin_all" on public.crm_training_progress for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- "Agents must only see and update their own training progress. They
-- must not see another agent's training record." - three narrow
-- policies (select/insert/update), deliberately no agent delete policy:
-- only an admin can remove a progress row (used for the Reset action).
create policy "crm_training_progress_self_select" on public.crm_training_progress for select
  using (user_id = auth.uid());

create policy "crm_training_progress_self_insert" on public.crm_training_progress for insert
  with check (user_id = auth.uid());

create policy "crm_training_progress_self_update" on public.crm_training_progress for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- crm_training_admin_actions - a permanent, append-only, admin-only audit
-- ledger for every management action (create/edit/reorder/activate/
-- deactivate/require-toggle/reset) - same design as crm_invoice_audit
-- (migration 0091) and crm_test_data_audit (migration 0103): identity/
-- title duplicated onto the row so it stays meaningful even if the
-- module or target user is later removed.
-- ---------------------------------------------------------------------
create table if not exists public.crm_training_admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.crm_users(id) on delete set null,
  admin_name text not null,
  action text not null check (action in (
    'module_created', 'module_updated', 'module_reordered',
    'module_activated', 'module_deactivated', 'module_required_changed',
    'progress_reset'
  )),
  module_id uuid references public.crm_training_modules(id) on delete set null,
  module_title text,
  target_user_id uuid references public.crm_users(id) on delete set null,
  target_user_name text,
  details text,
  occurred_at timestamptz not null default now()
);

create index if not exists crm_training_admin_actions_occurred_idx on public.crm_training_admin_actions(occurred_at desc);

alter table public.crm_training_admin_actions enable row level security;

create policy "crm_training_admin_actions_admin_all" on public.crm_training_admin_actions for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Seed: the 14 generic Winsalot Corp. modules, fully written, active,
-- and required from day one. Every module is assigned to the 'agent'
-- role; admins can already read every module regardless of assignment.
-- ---------------------------------------------------------------------

insert into public.crm_training_modules (slug, title, sort_order, is_required, is_active, current_version) values
  ('welcome-to-winsalot', 'Welcome to Winsalot Corp.', 1, true, true, 1),
  ('professional-business-communication', 'Professional Business Communication', 2, true, true, 1),
  ('confirming-business-name-first', 'Confirming the Business Name First', 3, true, true, 1),
  ('generic-winsalot-call-flow', 'Generic Winsalot Call Flow', 4, true, true, 1),
  ('winsalot-services', 'Winsalot Services', 5, true, true, 1),
  ('qualifying-a-business', 'Qualifying a Business', 6, true, true, 1),
  ('handling-common-business-responses', 'Handling Common Business Responses', 7, true, true, 1),
  ('booking-a-qualified-appointment', 'Booking a Qualified Appointment', 8, true, true, 1),
  ('crm-procedures', 'CRM Procedures', 9, true, true, 1),
  ('email-and-follow-up-procedures', 'Email and Follow-Up Procedures', 10, true, true, 1),
  ('privacy-and-confidentiality', 'Privacy and Confidentiality', 11, true, true, 1),
  ('attendance-and-work-standards', 'Attendance and Work Standards', 12, true, true, 1),
  ('compensation-and-incentives', 'Compensation and Incentives', 13, true, true, 1),
  ('prohibited-conduct', 'Prohibited Conduct', 14, true, true, 1)
on conflict (slug) do nothing;

insert into public.crm_training_module_assignments (module_id, assigned_role)
select id, 'agent' from public.crm_training_modules
on conflict (module_id, assigned_role) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Welcome to Winsalot Corp.', $json$
{
  "learningObjective": "Understand what Winsalot Corp. is, what services it offers, and what it means to represent the Winsalot name.",
  "explanation": "Winsalot Corp. is a Canadian company. Winsalot helps other businesses grow by providing B2B lead generation, appointment setting, business growth support, and business funding support.\n\nAs an agent, you contact businesses on behalf of Winsalot Corp. You are the voice of the company. Every call, email, and follow-up you send represents Winsalot's name and reputation.\n\nBecause of this, honesty, professionalism, and accurate CRM records are required at all times.",
  "steps": [
    "Learn the name of the company you represent: Winsalot Corp.",
    "Understand that Winsalot is Canadian and works with businesses across North America.",
    "Know the four main things Winsalot offers: lead generation, appointment setting, business growth support, and business funding support.",
    "Always identify yourself and Winsalot Corp. clearly at the start of every call.",
    "Keep every CRM entry honest and accurate, because it represents real work done in Winsalot's name."
  ],
  "examples": [
    "Agent: \"Hello, my name is Maria, calling from Winsalot Corp.\"",
    "Agent: \"We work with businesses across Canada to help them grow through lead generation and funding support.\""
  ],
  "approvedPhrases": [
    "\"I am calling on behalf of Winsalot Corp.\"",
    "\"Winsalot Corp. is a Canadian company that helps businesses grow.\"",
    "\"My name is [Agent Name], and I work with Winsalot Corp.\""
  ],
  "phrasesToAvoid": [
    "\"I work for myself.\"",
    "\"This isn't really a company, it's just me calling.\"",
    "Any statement that hides or downplays that you represent Winsalot Corp."
  ],
  "commonMistakes": [
    "Forgetting to say the company name clearly.",
    "Sounding unsure about who you represent.",
    "Skipping the introduction and jumping straight into the pitch."
  ],
  "keyReminders": [
    "You represent Winsalot Corp. on every call, email, and follow-up.",
    "Always be honest about who you are and who you work for.",
    "Accurate CRM records protect both you and the company."
  ],
  "summary": "Winsalot Corp. is a Canadian company that helps businesses grow through lead generation, appointment setting, growth support, and funding support. As an agent, you represent Winsalot's name every time you contact a business, so professionalism and honesty always come first."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'welcome-to-winsalot'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Professional Business Communication', $json$
{
  "learningObjective": "Learn how to speak with businesses in a way that is clear, respectful, and professional on every call.",
  "explanation": "How you speak matters as much as what you say. Business owners are busy, so your communication should be calm, respectful, and to the point.\n\nGood communication builds trust quickly. Poor communication - rushing, interrupting, or sounding pushy - can lose a prospect's interest in seconds.",
  "steps": [
    "Speak clearly and at a comfortable pace so the person can understand you easily.",
    "Use a calm, confident, and friendly tone.",
    "Listen fully before you respond. Do not interrupt.",
    "Keep your explanations short and simple.",
    "Respect the other person's time - get to the point quickly.",
    "If the person disagrees or pushes back, stay calm. Do not argue.",
    "Never promise something you are not authorized to promise.",
    "End every call politely, even if the answer is no."
  ],
  "examples": [
    "Prospect: \"I only have a minute.\" Agent: \"No problem, I will be quick. I just have one short question for you.\"",
    "Prospect interrupts with a question mid-sentence. Agent stops talking, listens fully, then answers calmly."
  ],
  "approvedPhrases": [
    "\"I understand, thank you for your time.\"",
    "\"That's a great question, let me explain.\"",
    "\"I appreciate you sharing that with me.\""
  ],
  "phrasesToAvoid": [
    "\"You have to listen to me.\"",
    "\"That's not what I said, listen again.\"",
    "\"I guarantee this will work for you.\" (never guarantee results)"
  ],
  "commonMistakes": [
    "Talking too fast because of nerves.",
    "Interrupting the prospect before they finish speaking.",
    "Sounding scripted or robotic instead of natural and warm.",
    "Arguing when a prospect disagrees."
  ],
  "keyReminders": [
    "Calm and confident always wins over rushed and pushy.",
    "Listening is just as important as talking.",
    "Always end the call politely, no matter the outcome."
  ],
  "summary": "Professional communication means speaking clearly, listening fully, respecting the prospect's time, and staying calm. A respectful call - even one that ends in \"no\" - protects Winsalot's reputation and keeps the door open for the future."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'professional-business-communication'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Confirming the Business Name First', $json$
{
  "learningObjective": "Learn why confirming the correct business name and decision-maker is the very first step of every call, and what to do in common situations.",
  "explanation": "Before you say anything about Winsalot's services, you must confirm you are speaking with the correct business and the correct person. This protects the business from confusion, protects Winsalot's reputation, and makes sure your time is well spent.\n\nThis step happens on every single call, with no exceptions.",
  "steps": [
    "Greet the person politely.",
    "Ask if you have reached the correct business by name.",
    "Once confirmed, ask to speak with the owner or the person responsible for business decisions.",
    "Do not describe the Winsalot service in detail until you know you are speaking with the right person."
  ],
  "examples": [
    "Agent: \"Hello, is this [Business Name]?\" Prospect: \"Yes, it is.\" Agent: \"Great. May I speak with the owner or the person responsible for business decisions?\"",
    "Agent: \"Hello, is this [Business Name]?\" Prospect: \"No, this is [Different Business].\" Agent: \"I'm sorry for the mix-up, thank you for letting me know.\" (End the call politely and correct the record.)"
  ],
  "approvedPhrases": [
    "\"Hello, is this [Business Name]?\"",
    "\"May I speak with the owner or the person responsible for business decisions?\"",
    "\"I'm calling from Winsalot Corp. May I know when the owner is usually available?\""
  ],
  "phrasesToAvoid": [
    "\"Are you in charge?\" (too vague, can confuse the prospect)",
    "Describing the full service pitch before confirming the business name.",
    "\"It doesn't matter who I speak to.\""
  ],
  "commonMistakes": [
    "Skipping the business name confirmation and going straight into the pitch.",
    "Not asking for the decision-maker and pitching to the wrong person.",
    "Getting flustered when the business name is wrong instead of correcting the record calmly."
  ],
  "keyReminders": [
    "If the business name is incorrect: apologize politely, thank them, and correct or remove the record.",
    "If the business has closed: thank them for letting you know and mark the record accordingly in the CRM.",
    "If the person is not the decision-maker: politely ask when the owner or manager is usually available, or ask for the best way to reach them.",
    "If the decision-maker is unavailable: ask for the best time to call back and note it in the CRM.",
    "If the person asks why you are calling: give a short, honest answer, for example: \"I'm calling to see if [Business Name] might benefit from some services we offer to help businesses grow.\""
  ],
  "summary": "Always confirm the business name and reach the right decision-maker before presenting anything. This one habit prevents wasted time, protects the business's information, and keeps every call professional and accurate."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'confirming-business-name-first'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Generic Winsalot Call Flow', $json$
{
  "learningObjective": "Learn the required step-by-step call flow used on every Winsalot call.",
  "explanation": "Every call follows the same basic structure. Following this flow in order keeps your calls professional, consistent, and effective, no matter which business you are speaking with.",
  "steps": [
    "Greet the person.",
    "Confirm the correct business name.",
    "Ask for the owner, manager, or decision-maker.",
    "Introduce yourself and Winsalot Corp.",
    "Give a brief and honest reason for calling.",
    "Ask simple qualifying questions.",
    "Listen for interest.",
    "Request a consultation or the appropriate next step.",
    "Confirm phone number, email address, appointment date, time, and time zone.",
    "Record an accurate call outcome and notes in the CRM."
  ],
  "examples": [
    "Agent: \"Hello, is this [Business Name]? ... Great, may I speak with the owner or the person responsible for business decisions? ... My name is [Agent Name], calling from Winsalot Corp. We help businesses with lead generation, business growth support, and access to business funding options. I'm calling to see whether any of these services may be useful to your business.\""
  ],
  "approvedPhrases": [
    "\"My name is [Agent Name], calling from Winsalot Corp. We help businesses with lead generation, business growth support, and access to business funding options. I'm calling to see whether any of these services may be useful to your business.\"",
    "\"Would it be alright if I ask a few quick questions about your business?\"",
    "\"Based on what you've shared, I think a short consultation could be helpful. Would you be open to that?\""
  ],
  "phrasesToAvoid": [
    "Skipping steps or jumping straight to booking an appointment.",
    "Mentioning services that are not relevant to the assigned call objective.",
    "Ending the call without recording the outcome in the CRM."
  ],
  "commonMistakes": [
    "Forgetting to confirm contact details before ending the call.",
    "Not listening for buying signals because you are focused on reading a script.",
    "Leaving vague or missing notes in the CRM after the call."
  ],
  "keyReminders": [
    "Only mention the service relevant to your assigned call objective. Do not pitch every service on every call unless instructed to.",
    "The call flow is a guide, not a rigid script. Stay natural while covering every step.",
    "Every call ends with an accurate CRM entry, even if the outcome was \"not interested.\""
  ],
  "summary": "The Winsalot call flow has ten steps: greet, confirm the business, reach the decision-maker, introduce yourself and Winsalot, explain why you're calling, ask questions, listen, request next steps, confirm details, and record the outcome. Following this flow every time keeps your calls consistent and professional."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'generic-winsalot-call-flow'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Winsalot Services', $json$
{
  "learningObjective": "Understand the three core Winsalot services and what agents can and cannot promise about each one.",
  "explanation": "Winsalot offers three main services to businesses. It is important to describe each service accurately and never promise something that is not guaranteed.",
  "steps": [
    "Learn the three services: B2B Lead Generation and Appointment Setting, Business Growth Support, and Business Funding Support.",
    "For lead generation: explain that Winsalot helps businesses connect with potential customers. Never guarantee a specific number of sales or amount of revenue.",
    "For growth support: explain that Winsalot helps identify opportunities to improve outreach and growth. Never promise guaranteed business results.",
    "For funding support: explain that Winsalot helps eligible businesses explore funding through lending partners. Funding is always subject to lender requirements and approval.",
    "Never guarantee a funding approval, amount, interest rate, or funding date.",
    "Remember that Winsalot's funding-support service is free to applicants. Compensation may come from the lender only when a transaction funds."
  ],
  "examples": [
    "Prospect: \"So you can guarantee me more customers?\" Agent: \"I can't guarantee a specific number, but we work to connect businesses like yours with potential customers who may be a good fit.\"",
    "Prospect: \"Will I definitely get approved for funding?\" Agent: \"Approval always depends on the lender's requirements, so I can't guarantee that, but I'd be happy to help you explore your options.\""
  ],
  "approvedPhrases": [
    "\"We help businesses connect with potential customers.\"",
    "\"We help identify opportunities to improve outreach and growth.\"",
    "\"We help eligible businesses explore funding options with our lending partners, subject to their approval.\"",
    "\"Our funding-support service is free for you to use.\""
  ],
  "phrasesToAvoid": [
    "\"We guarantee you'll get more sales.\"",
    "\"You will definitely be approved.\"",
    "\"I can promise you a specific interest rate or amount.\"",
    "\"This will guarantee your business grows.\""
  ],
  "commonMistakes": [
    "Promising specific numbers, amounts, or outcomes.",
    "Mixing up the three services and giving inaccurate information.",
    "Forgetting to mention that funding is subject to lender approval."
  ],
  "keyReminders": [
    "Never guarantee sales, revenue, growth results, funding approval, amount, interest rate, or funding date.",
    "Only describe the service that matches your assigned call objective.",
    "Funding support is always free to the applicant."
  ],
  "summary": "Winsalot offers lead generation, business growth support, and funding support. Each service is described honestly, and agents must never guarantee results, approval, or specific numbers for any of them."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'winsalot-services'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Qualifying a Business', $json$
{
  "learningObjective": "Learn the difference between a contact, lead, interested lead, qualified lead, follow-up, and qualified appointment, and know what makes an appointment truly qualified.",
  "explanation": "Not every business you speak with becomes an appointment. Understanding these stages helps you know where each prospect stands and what to do next.",
  "steps": [
    "Contact: a business you have reached but have not yet had a full conversation with.",
    "Lead: a business that matches the type of company Winsalot is looking for.",
    "Interested lead: a lead that has shown some interest in learning more.",
    "Qualified lead: a lead that meets the requirements and has real, genuine interest.",
    "Follow-up: a lead that needs to be contacted again at a later time.",
    "Qualified appointment: a confirmed meeting that meets all the requirements below."
  ],
  "examples": [
    "A business answers the phone but says \"call back another time\" - this stays a contact or follow-up, not a qualified lead.",
    "A business owner says \"yes, I'd like to learn more, can we set up a time to talk?\" - this becomes a qualified appointment once the details are confirmed."
  ],
  "approvedPhrases": [
    "\"It sounds like this could be a good fit. Would you be open to a short consultation?\"",
    "\"Let's find a time that works well for you.\""
  ],
  "phrasesToAvoid": [
    "Marking a lead as \"qualified\" just to reach a target, without genuine interest.",
    "Booking an appointment with someone who is not a decision-maker."
  ],
  "commonMistakes": [
    "Confusing an interested lead with a qualified lead.",
    "Booking appointments that do not meet all the qualified appointment requirements.",
    "Forgetting to confirm the time zone."
  ],
  "keyReminders": [
    "A qualified appointment must have: the correct business, an appropriate industry, an owner, manager, or decision-maker, genuine interest, a confirmed date and time, a confirmed time zone, a correct phone number, an email address when available, a clear reason for the meeting, and the prospect's agreement to attend.",
    "Quality matters more than quantity. A genuinely qualified appointment is worth more than several rushed, unqualified ones."
  ],
  "summary": "Every prospect moves through stages: contact, lead, interested lead, qualified lead, follow-up, and finally a qualified appointment. A qualified appointment must meet every requirement listed above, confirmed clearly with the prospect."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'qualifying-a-business'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Handling Common Business Responses', $json$
{
  "learningObjective": "Learn short, honest, professional responses to the most common things business owners say.",
  "explanation": "Business owners will often respond the same few ways. Having a calm, honest, and ready response for each one helps you stay professional and confident.",
  "steps": [
    "Listen fully to what the business owner says before responding.",
    "Acknowledge what they said - do not dismiss it.",
    "Give a short, honest, and calm response.",
    "Ask a simple follow-up question, or respect their decision if they decline.",
    "Record the response and outcome accurately in the CRM."
  ],
  "examples": [
    "\"I'm not interested.\" -> \"No problem, thank you for your time. Have a great day.\"",
    "\"Send me information.\" -> \"Of course, may I confirm the best email address to send that to?\"",
    "\"Call me later.\" -> \"That works. What day and time would be best for you?\"",
    "\"We already use another company.\" -> \"That's great to hear. Would you be open to a quick comparison in case it's helpful down the road?\"",
    "\"How much does it cost?\" -> \"That depends on your specific needs, which is exactly what we'd cover in a short consultation.\"",
    "\"Who is Winsalot?\" -> \"Winsalot Corp. is a Canadian company that helps businesses with lead generation, growth support, and funding support.\"",
    "\"Where did you get my information?\" -> \"We reach out to publicly available business contact information as part of our outreach.\"",
    "\"Is funding guaranteed?\" -> \"No, funding always depends on the lender's approval, but I'd be glad to help you explore your options.\"",
    "\"Remove me from your list.\" -> \"Understood, I will remove you right away. Thank you for letting me know.\""
  ],
  "approvedPhrases": [
    "\"No problem, thank you for your time.\"",
    "\"I understand completely.\"",
    "\"Thank you for letting me know, I will update our records.\""
  ],
  "phrasesToAvoid": [
    "\"Are you sure? Let me explain why you're wrong.\"",
    "\"Just give me two minutes, please.\" (after they've clearly said no)",
    "Continuing to pitch after someone asks to be removed from the list."
  ],
  "commonMistakes": [
    "Arguing with a prospect who says they are not interested.",
    "Forgetting to record a do-not-contact request in the CRM.",
    "Giving inconsistent answers about pricing or the company."
  ],
  "keyReminders": [
    "Always respect a request not to be contacted again, and record it correctly and immediately.",
    "Honesty builds more trust than a forced sales pitch.",
    "A polite \"no\" today does not mean \"never\" - keep every interaction respectful."
  ],
  "summary": "Business owners often respond in similar ways. Listen fully, respond honestly and briefly, and always respect a request to stop contact. Recording the outcome accurately in the CRM is just as important as the conversation itself."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'handling-common-business-responses'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Booking a Qualified Appointment', $json$
{
  "learningObjective": "Learn the exact steps required to book a properly confirmed, qualified appointment.",
  "explanation": "Booking an appointment is one of the most important parts of the call. A properly booked appointment saves everyone time and reflects well on Winsalot.",
  "steps": [
    "Obtain clear agreement from the prospect before booking anything.",
    "Confirm the appointment's purpose.",
    "Confirm the correct date.",
    "Confirm the time.",
    "Confirm the prospect's time zone.",
    "Repeat the time in both relevant time zones when necessary.",
    "Confirm the phone number and email address.",
    "Confirm who will attend the appointment.",
    "Enter detailed, accurate CRM notes.",
    "Never book an appointment without the prospect's clear permission.",
    "Never create a test appointment in a live client campaign."
  ],
  "examples": [
    "Agent: \"Just to confirm, we'll meet this Thursday, June 5th, at 2:00 PM Eastern Time - that's 11:00 AM Pacific Time for you. Does that work?\"",
    "Agent: \"Can I confirm the best phone number and email to send the confirmation to?\""
  ],
  "approvedPhrases": [
    "\"Would you be open to a short consultation to go over this?\"",
    "\"Let's confirm the date, time, and time zone so we're both on the same page.\"",
    "\"Who will be joining the meeting from your side?\""
  ],
  "phrasesToAvoid": [
    "\"I'll just pencil you in.\" (without clear agreement)",
    "Booking a time without confirming the time zone.",
    "\"I'll just create a placeholder appointment for now.\" (never create test appointments in a live campaign)"
  ],
  "commonMistakes": [
    "Forgetting to confirm the time zone, causing missed appointments.",
    "Not confirming the email address, so confirmations never arrive.",
    "Leaving vague CRM notes that don't explain what was agreed to."
  ],
  "keyReminders": [
    "Never book an appointment without the prospect's clear, spoken agreement.",
    "Never create a test appointment inside a real, live client campaign.",
    "Detailed CRM notes help everyone who works with this lead after you."
  ],
  "summary": "A qualified appointment is only complete once the date, time, time zone, contact details, and attendees are all clearly confirmed with the prospect's permission, and everything is recorded accurately in the CRM."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'booking-a-qualified-appointment'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'CRM Procedures', $json$
{
  "learningObjective": "Learn how to use the CRM accurately and responsibly for every lead and call.",
  "explanation": "The CRM is the official record of every conversation. Accurate CRM use keeps the whole team organized and prevents wasted effort.",
  "steps": [
    "Search for an existing record before creating a new lead.",
    "Avoid creating duplicate records for the same business.",
    "Enter accurate business and contact information.",
    "Record the outcome of every call, even if there was no answer.",
    "Write clear, useful notes that explain what happened and what to do next.",
    "Schedule follow-ups at the correct date and time.",
    "Mark do-not-contact requests correctly and immediately.",
    "Book confirmed appointments with complete details.",
    "Correct mistakes as soon as you notice them.",
    "Never create false activity, calls, or leads."
  ],
  "examples": [
    "Before adding \"ABC Plumbing,\" search the CRM first to check if it already exists.",
    "Note example: \"Spoke with owner, John. Interested in funding support. Follow up Tuesday at 10 AM EST to discuss consultation.\""
  ],
  "approvedPhrases": [
    "Clear, factual notes such as: \"Left voicemail, will try again Thursday.\"",
    "\"Marked as do-not-contact per the prospect's request.\""
  ],
  "phrasesToAvoid": [
    "Vague notes like \"called, nothing.\"",
    "Copy-pasting the same note on every record without updating it.",
    "Marking a call as completed when it was never actually made."
  ],
  "commonMistakes": [
    "Creating a duplicate record instead of searching first.",
    "Leaving a lead's status unclear or outdated.",
    "Forgetting to mark a do-not-contact request."
  ],
  "keyReminders": [
    "The CRM is the single source of truth - if it isn't written down, it didn't happen.",
    "Never create false activity. This is a serious violation of Winsalot policy.",
    "Fix mistakes as soon as you find them, don't leave them for someone else."
  ],
  "summary": "Good CRM habits - searching before creating, writing clear notes, recording every outcome, and never faking activity - keep the whole team working efficiently and honestly."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'crm-procedures'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Email and Follow-Up Procedures', $json$
{
  "learningObjective": "Learn how to send emails and schedule follow-ups the right way.",
  "explanation": "Email is an important tool for following up with prospects, but it must always be used carefully and correctly.",
  "steps": [
    "Confirm the email address is correct before sending anything.",
    "Use only approved templates for outgoing emails.",
    "Send information only when it is appropriate and requested or expected.",
    "Never change approved claims, pricing, or wording without authorization.",
    "Schedule follow-ups accurately based on the conversation.",
    "Record every email and follow-up in the CRM.",
    "Avoid sending excessive or unauthorized emails.",
    "Respect every unsubscribe and do-not-contact request immediately."
  ],
  "examples": [
    "Prospect: \"Yes, please send me more information.\" Agent: \"Great, can I confirm your email address is [email]?\" Then sends the approved information template and logs it in the CRM."
  ],
  "approvedPhrases": [
    "\"Can I confirm the best email address to send that to?\"",
    "\"I've sent that over, please let me know if you have any questions.\""
  ],
  "phrasesToAvoid": [
    "\"I'll just send you a lower price to close this faster.\" (never change pricing without authorization)",
    "Sending the same follow-up email multiple times in a short period.",
    "Ignoring an unsubscribe request."
  ],
  "commonMistakes": [
    "Sending an email to the wrong or misspelled address.",
    "Using a personal, unapproved template instead of the approved one.",
    "Forgetting to log the email in the CRM."
  ],
  "keyReminders": [
    "Never alter approved claims or pricing without authorization.",
    "Every unsubscribe or do-not-contact request must be respected immediately.",
    "Accurate CRM logging applies to emails and follow-ups just as much as calls."
  ],
  "summary": "Emails and follow-ups must use approved templates, correct contact details, and accurate CRM records. Unauthorized changes to pricing or claims, and ignoring unsubscribe requests, are never acceptable."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'email-and-follow-up-procedures'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Privacy and Confidentiality', $json$
{
  "learningObjective": "Understand how to protect client, prospect, and company information at all times.",
  "explanation": "Winsalot works with sensitive information about businesses and prospects. Protecting this information is a serious responsibility for every agent.",
  "steps": [
    "Protect client, prospect, and company information at all times.",
    "Never export or share CRM information without permission.",
    "Never share your login or password with anyone.",
    "Use company data only for assigned Winsalot work.",
    "Keep your screen and files secure, especially in public or shared spaces.",
    "Report any suspected privacy or security problem immediately."
  ],
  "examples": [
    "A coworker asks to borrow your login instead of getting their own account. You say no and report it if asked again.",
    "You notice a spreadsheet with prospect data was shared outside the company. You report it immediately to your admin."
  ],
  "approvedPhrases": [
    "\"I can't share my login, but I can help you get access set up properly.\"",
    "\"I noticed something that doesn't look right with our data, I wanted to report it.\""
  ],
  "phrasesToAvoid": [
    "\"It's fine, just use my login for now.\"",
    "\"I'll just email this list to my personal email to work on it later.\""
  ],
  "commonMistakes": [
    "Leaving your screen unlocked in a shared or public space.",
    "Downloading or exporting CRM data without permission.",
    "Waiting too long to report a suspected problem."
  ],
  "keyReminders": [
    "Company data is only for assigned Winsalot work - never personal use.",
    "Never share passwords, even with coworkers you trust.",
    "Report privacy or security concerns right away, not later."
  ],
  "summary": "Protecting client, prospect, and company data is a core responsibility. Never share logins, never export data without permission, and always report privacy or security concerns immediately."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'privacy-and-confidentiality'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Attendance and Work Standards', $json$
{
  "learningObjective": "Understand the expected work schedule, break structure, and professional conduct standards.",
  "explanation": "Reliable attendance and following the schedule correctly keeps the team running smoothly and ensures fair treatment for everyone.",
  "steps": [
    "Work your assigned eight-hour schedule.",
    "Clock in and out accurately at the start and end of your shift.",
    "Take your first 15-minute break after approximately two hours of calls.",
    "Take your 30-minute lunch after approximately four hours.",
    "Take your final 15-minute break during the last two hours of your shift.",
    "Return from every break on time.",
    "Follow Winsalot's policy for any approved leave or absence.",
    "Maintain professional conduct throughout your working hours."
  ],
  "examples": [
    "Shift starts at 9:00 AM: first break around 11:00 AM, lunch around 1:00 PM, final break around 3:30 PM, shift ends at 5:00 PM."
  ],
  "approvedPhrases": [
    "\"I need to request approved leave for [date], following the leave request process.\""
  ],
  "phrasesToAvoid": [
    "\"I'll just clock in later and adjust the time myself.\"",
    "\"I'm going to skip my lunch and leave early instead.\" (without approval)"
  ],
  "commonMistakes": [
    "Forgetting to clock in or out.",
    "Taking breaks at the wrong time or for longer than scheduled.",
    "Not submitting leave requests through the proper process."
  ],
  "keyReminders": [
    "Accurate clock-in and clock-out times matter for payroll and fairness to the whole team.",
    "Breaks and lunch have a recommended timing, but always follow your specific schedule.",
    "Professional conduct is expected throughout the entire workday, not just during calls."
  ],
  "summary": "A full workday includes two 15-minute breaks and one 30-minute lunch, spaced through an eight-hour shift. Accurate clock-ins, on-time breaks, and professional conduct are expected every day."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'attendance-and-work-standards'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Compensation and Incentives', $json$
{
  "learningObjective": "Understand how compensation and incentives work, and what determines eligibility.",
  "explanation": "Compensation and incentives reward valid, reviewed results. Understanding how this works helps you focus on real, qualified activity.",
  "steps": [
    "Compensation follows your approved employment arrangement.",
    "Incentives are based only on valid and reviewed results.",
    "Some appointments may require admin review before they count toward incentives.",
    "Duplicate, false, test, cancelled, or unqualified activity may not qualify.",
    "Never manipulate CRM activity to try to earn incentives.",
    "The admin's review determines final incentive eligibility."
  ],
  "examples": [
    "An agent books five appointments, but one is later found to be a duplicate and one is a test entry. Only the three valid, qualified appointments count toward incentives after admin review."
  ],
  "approvedPhrases": [
    "\"I can see my own compensation details on my account, and I can ask my admin if I have questions.\""
  ],
  "phrasesToAvoid": [
    "\"I'll just mark this as qualified so it counts, even though I'm not sure.\"",
    "\"Let's create an extra test appointment to boost the numbers.\" (never do this)"
  ],
  "commonMistakes": [
    "Assuming every booked appointment automatically counts before review.",
    "Trying to inflate numbers with duplicate or false activity.",
    "Sharing or comparing private compensation details with other agents."
  ],
  "keyReminders": [
    "Only valid, reviewed, genuine activity counts toward incentives.",
    "Manipulating CRM activity to earn incentives is a serious policy violation.",
    "You may only see your own authorized compensation information, never another agent's."
  ],
  "summary": "Compensation follows your approved arrangement, and incentives are only earned through valid, reviewed, genuine activity. Manipulating records to earn incentives is never acceptable, and compensation details are private to each individual."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'compensation-and-incentives'
on conflict (module_id, version) do nothing;

insert into public.crm_training_module_versions (module_id, version, title, content, is_major_revision)
select id, 1, 'Prohibited Conduct', $json$
{
  "learningObjective": "Understand the behaviors that are strictly prohibited for every Winsalot agent.",
  "explanation": "Certain actions are never acceptable, regardless of the situation. Understanding these clearly protects prospects, the company, and your own position.",
  "steps": [
    "Never use abusive, threatening, or discriminatory language.",
    "Never harass or pressure a prospect.",
    "Never misrepresent your identity.",
    "Never claim to be the client company or the lender.",
    "Never guarantee funding, revenue, sales, appointments, or results.",
    "Never make unauthorized pricing promises.",
    "Never create false leads, calls, or appointments.",
    "Never book an appointment without the prospect's clear agreement.",
    "Never share confidential CRM data.",
    "Never use prospect information for personal purposes.",
    "Never continue contacting someone who has asked not to be contacted.",
    "Never contact consumers when the assigned work is B2B-only.",
    "Never record false attendance or work activity."
  ],
  "examples": [
    "A prospect asks to be removed from the call list. The agent stops contacting them immediately and marks it in the CRM - continuing to call would be a serious violation.",
    "An agent is tempted to say \"you're approved\" to close a funding conversation faster. This is never allowed - approval is always the lender's decision."
  ],
  "approvedPhrases": [
    "\"I understand, I will not contact you again. Thank you.\"",
    "\"I represent Winsalot Corp., not [Client/Lender Name] directly.\""
  ],
  "phrasesToAvoid": [
    "Any guarantee of funding, sales, revenue, or results.",
    "Claiming to be someone you are not.",
    "Any pressure tactics or repeated unwanted contact."
  ],
  "commonMistakes": [
    "Making a guarantee to close a call faster.",
    "Continuing to call after a do-not-contact request.",
    "Recording attendance or activity that did not actually happen."
  ],
  "keyReminders": [
    "These rules apply at all times, with no exceptions.",
    "Violating prohibited conduct rules can lead to serious consequences, including termination.",
    "When in doubt, choose the honest and respectful option every time."
  ],
  "summary": "Certain actions are always prohibited: false guarantees, misrepresentation, harassment, false CRM activity, unauthorized data sharing, and ignoring do-not-contact requests. These rules protect prospects, the company, and every agent."
}
$json$::jsonb, true
from public.crm_training_modules where slug = 'prohibited-conduct'
on conflict (module_id, version) do nothing;
