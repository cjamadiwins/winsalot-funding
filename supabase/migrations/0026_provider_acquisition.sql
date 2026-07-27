-- Provider Acquisition: a completely separate CRM section for recruiting
-- and onboarding cleaning providers (companies Winsalot could dispatch
-- work to), distinct from crm_leads (customer quote requests) and from
-- active_cleaning_opportunities (public cleaning-intent signals). Purely
-- additive - no existing table, column, row, policy, or trigger from any
-- prior migration is dropped or rewritten in a way that changes its
-- existing behavior for leads/opportunities.
--
-- Follows the same layering already established for Cleaning
-- Opportunities (migrations 0012/0013): its own table for the
-- provider-specific fields, but the *existing* crm_activities (call/note
-- timeline), crm_followups (Follow-Up Calendar), and crm_lead_emails
-- (Resend delivery tracking) tables are extended with a third nullable
-- target column rather than building three more parallel systems.

create table if not exists public.provider_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business_name text not null,
  contact_person text,
  phone text not null,
  email text,
  city text not null,
  province text not null check (province in (
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
    'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
    'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan',
    'Yukon'
  )),
  website text,
  -- Multiple selections allowed - validated against the fixed list in the
  -- application layer (src/lib/provider-types.ts), same as the
  -- unconstrained text[] pattern already used for
  -- active_cleaning_opportunities.matched_cleaning_terms.
  services_offered text[] not null default '{}',
  years_in_business text,
  assigned_agent_id uuid references public.crm_users(id) on delete set null,
  created_by uuid references public.crm_users(id) on delete set null,
  lead_source text,
  status text not null default 'New' check (status in (
    'New', 'Contact Attempted', 'Contacted', 'Interested', 'Intake Form Sent',
    'Follow-up Required', 'Intake Form Completed', 'Under Review',
    'Approved Provider', 'Not Interested', 'Invalid Contact', 'Closed'
  )),
  -- Derived/system-maintained the same way as crm_leads/opportunities:
  -- next_follow_up_at is kept in sync by the crm_followups trigger
  -- (extended below); last_contacted_at is set directly by the "add call
  -- note"/"log activity" actions.
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  -- Denormalized "latest intake email status" mirrored by the Resend
  -- webhook handler, exactly the same pattern as crm_leads.last_email_*
  -- (migration 0022).
  last_email_status text check (last_email_status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed'
  )),
  last_email_status_at timestamptz,
  last_email_type text check (last_email_type in ('provider_intake')),
  last_email_to text,
  closed_at timestamptz,
  closed_by uuid references public.crm_users(id) on delete set null
);

create index if not exists provider_leads_assigned_agent_idx on public.provider_leads(assigned_agent_id);
create index if not exists provider_leads_status_idx on public.provider_leads(status);
create index if not exists provider_leads_city_idx on public.provider_leads(city);
create index if not exists provider_leads_province_idx on public.provider_leads(province);
create index if not exists provider_leads_email_idx on public.provider_leads(lower(email));
create index if not exists provider_leads_phone_idx on public.provider_leads(phone);
create index if not exists provider_leads_business_name_idx on public.provider_leads(lower(business_name));
create index if not exists provider_leads_next_follow_up_idx on public.provider_leads(next_follow_up_at);

alter table public.provider_leads enable row level security;

create or replace function public.provider_leads_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists provider_leads_updated_at_trigger on public.provider_leads;

create trigger provider_leads_updated_at_trigger
  before update on public.provider_leads
  for each row
  execute function public.provider_leads_set_updated_at();

-- Admins: full read/write/delete on every provider lead.
create policy "provider_leads_admin_all"
  on public.provider_leads for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- Agents: only providers currently assigned to them - same
-- "scoped through the current assignment column" pattern as
-- crm_leads_agent_select_own.
create policy "provider_leads_agent_select_own"
  on public.provider_leads for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent_id = auth.uid()
  );

create policy "provider_leads_agent_insert_own"
  on public.provider_leads for insert
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and created_by = auth.uid()
    and assigned_agent_id = auth.uid()
  );

create policy "provider_leads_agent_update_own"
  on public.provider_leads for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent_id = auth.uid()
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and assigned_agent_id = auth.uid()
  );

-- Unlike crm_leads (agents have no delete policy at all), the brief for
-- Provider Acquisition explicitly allows an agent to delete a provider
-- lead they created or that is assigned to them.
create policy "provider_leads_agent_delete_own"
  on public.provider_leads for delete
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (created_by = auth.uid() or assigned_agent_id = auth.uid())
  );

-- Extend crm_activities (the existing call/note/outcome timeline, already
-- shared between crm_leads and active_cleaning_opportunities - migration
-- 0013) so a row can also belong to a provider_leads record. lead_id was
-- already made nullable by migration 0013.
alter table public.crm_activities
  add column if not exists provider_lead_id uuid references public.provider_leads(id) on delete cascade;

-- Records the call outcome selected on "Add Call Note" (section 8 of the
-- brief) as a first-class column rather than folding it into the free-text
-- notes field, so the UI can render it distinctly. Nullable and unused by
-- lead/opportunity activities.
alter table public.crm_activities
  add column if not exists call_outcome text check (call_outcome is null or call_outcome in (
    'No Answer', 'Voicemail Left', 'Receptionist', 'Decision-Maker Reached', 'Interested',
    'Asked for Email', 'Intake Form Sent During Call', 'Follow-up Requested', 'Not Interested',
    'Wrong Number', 'Business Closed', 'Other'
  ));

alter table public.crm_activities drop constraint if exists crm_activities_exactly_one_target;
alter table public.crm_activities add constraint crm_activities_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when opportunity_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    = 1
  );

create index if not exists crm_activities_provider_lead_idx on public.crm_activities(provider_lead_id, occurred_at desc);

drop policy if exists "crm_activities_agent_select_own_lead" on public.crm_activities;
create policy "crm_activities_agent_select_own_lead"
  on public.crm_activities for select
  using (
    (lead_id is not null and exists (
      select 1 from public.crm_leads l
      where l.id = lead_id and l.assigned_agent_id = auth.uid()
    ))
    or
    (opportunity_id is not null and exists (
      select 1 from public.active_cleaning_opportunities o
      where o.id = opportunity_id and o.assigned_agent = auth.uid()
    ))
    or
    (provider_lead_id is not null and exists (
      select 1 from public.provider_leads p
      where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
    ))
  );

drop policy if exists "crm_activities_agent_insert_own_lead" on public.crm_activities;
create policy "crm_activities_agent_insert_own_lead"
  on public.crm_activities for insert
  with check (
    agent_id = auth.uid()
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
    )
  );

-- Same extension for crm_followups (the Follow-Up Calendar / "Provider
-- Follow-ups" dashboard section).
alter table public.crm_followups
  add column if not exists provider_lead_id uuid references public.provider_leads(id) on delete cascade;

alter table public.crm_followups drop constraint if exists crm_followups_exactly_one_target;
alter table public.crm_followups add constraint crm_followups_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when opportunity_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    = 1
  );

create index if not exists crm_followups_provider_lead_idx on public.crm_followups(provider_lead_id);
create index if not exists crm_followups_provider_lead_pending_scheduled_at_idx
  on public.crm_followups(scheduled_at)
  where status = 'pending' and provider_lead_id is not null;

drop policy if exists "crm_followups_agent_select_own_lead" on public.crm_followups;
create policy "crm_followups_agent_select_own_lead"
  on public.crm_followups for select
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
    )
  );

drop policy if exists "crm_followups_agent_insert_own_lead" on public.crm_followups;
create policy "crm_followups_agent_insert_own_lead"
  on public.crm_followups for insert
  with check (
    scheduled_by = auth.uid()
    and public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
    )
  );

drop policy if exists "crm_followups_agent_update_own_lead" on public.crm_followups;
create policy "crm_followups_agent_update_own_lead"
  on public.crm_followups for update
  using (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
    )
  )
  with check (
    public.crm_user_role(auth.uid()) = 'agent'
    and (
      (lead_id is not null and exists (
        select 1 from public.crm_leads l
        where l.id = lead_id and l.assigned_agent_id = auth.uid()
      ))
      or
      (opportunity_id is not null and exists (
        select 1 from public.active_cleaning_opportunities o
        where o.id = opportunity_id and o.assigned_agent = auth.uid()
      ))
      or
      (provider_lead_id is not null and exists (
        select 1 from public.provider_leads p
        where p.id = provider_lead_id and p.assigned_agent_id = auth.uid()
      ))
    )
  );

-- Extends the existing sync trigger function (created in migration 0011,
-- extended for opportunities in 0013) in place so it also maintains
-- provider_leads.next_follow_up_at. Leads and opportunities keep behaving
-- exactly as before.
create or replace function public.crm_followups_sync_lead_next_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead_id uuid := coalesce(new.lead_id, old.lead_id);
  target_opportunity_id uuid := coalesce(new.opportunity_id, old.opportunity_id);
  target_provider_lead_id uuid := coalesce(new.provider_lead_id, old.provider_lead_id);
  next_pending timestamptz;
begin
  if target_lead_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where lead_id = target_lead_id and status = 'pending';

    update public.crm_leads
    set next_follow_up_at = next_pending
    where id = target_lead_id;
  end if;

  if target_opportunity_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where opportunity_id = target_opportunity_id and status = 'pending';

    update public.active_cleaning_opportunities
    set next_follow_up_at = next_pending
    where id = target_opportunity_id;
  end if;

  if target_provider_lead_id is not null then
    select min(scheduled_at) into next_pending
    from public.crm_followups
    where provider_lead_id = target_provider_lead_id and status = 'pending';

    update public.provider_leads
    set next_follow_up_at = next_pending
    where id = target_provider_lead_id;
  end if;

  return coalesce(new, old);
end;
$$;

-- Extend crm_lead_emails (the existing Resend delivery-tracking table,
-- migration 0022/0023) so a tracked send can target a provider lead
-- instead of a crm_leads lead. Same legacy RLS pattern as before (enabled,
-- no policies - service-role only); nothing here changes how an existing
-- lead-targeted row behaves.
alter table public.crm_lead_emails
  add column if not exists provider_lead_id uuid references public.provider_leads(id) on delete cascade;

alter table public.crm_lead_emails alter column lead_id drop not null;

alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_exactly_one_target;
alter table public.crm_lead_emails add constraint crm_lead_emails_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    = 1
  );

alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_email_type_check;
alter table public.crm_lead_emails add constraint crm_lead_emails_email_type_check
  check (email_type in ('quote_request', 'follow_up', 'provider_intake'));

create index if not exists crm_lead_emails_provider_lead_idx on public.crm_lead_emails(provider_lead_id, created_at desc);

-- Sales Training & Call Scripts: a lightweight category label so the new
-- "Cleaning Provider Recruitment" material groups separately from the
-- existing (uncategorized) commercial-cleaning scripts on both
-- /agent/training and /admin/crm/training. Nullable - every existing row
-- (migrations 0018/0021/0025) simply has no category and continues to
-- render under the default "General" grouping.
alter table public.crm_training_materials
  add column if not exists category text;

insert into public.crm_training_materials (title, content, sort_order, category) values (
  'Cleaning Provider Onboarding Call Script',
  'AGENT:
"Good morning, is this [Business Name]?"

WAIT FOR CONFIRMATION.

"Wonderful. My name is [Agent Name], and I''m calling from Winsalot Corp.
The reason for my call is that we help connect customers who are looking for cleaning services with professional cleaning companies.
We are currently expanding our cleaning provider network in your area, and your company came up as one we would like to invite."

IF THEY SHOW INTEREST:
"There is no cost to complete our provider intake form.
The form helps us understand the services your company provides, the locations you serve, and the types of cleaning opportunities that may be suitable for your business.
You are not required to accept every opportunity."

TRANSITION TO EMAIL:
"I would like to send you our short provider intake form. It only takes a few minutes to complete.
What is the best email address for me to send it to?"

CONFIRM THE EMAIL ADDRESS BY READING IT BACK TO THEM.

"Thank you. I''m sending the form now.
Please check your inbox for an email from Winsalot Corp. The email will contain a link to our provider intake form at leads.winsalotcorp.com."

CLOSING:
"Once the form is completed, our team will review your information and contact you regarding suitable cleaning opportunities.
Thank you for your time, and have a wonderful day."',
  100,
  'Cleaning Provider Recruitment'
);

insert into public.crm_training_materials (title, content, sort_order, category) values (
  'Provider Recruitment — Objection Responses',
  'IF THEY SAY THEY ALREADY HAVE ENOUGH WORK:
"I completely understand.
Many providers join our network so they can receive additional opportunities during slower periods.
There is no obligation to accept every opportunity, and you can decide which opportunities are suitable for your company."

IF THEY ASK ABOUT THE COST:
"There is no cost to complete the provider intake form.
Our team will review your information and explain how the provider process works before anything moves forward."

IF THEY SAY THEY ALREADY USE ANOTHER LEAD SERVICE:
"That is not a problem.
You do not have to replace any service you currently use. Winsalot can simply be an additional source of cleaning opportunities for your company."

IF THEY ASK WHETHER WORK IS GUARANTEED:
"We cannot guarantee a specific number of opportunities.
The purpose of the intake form is to understand your services and coverage area so we can contact you when a suitable request becomes available."

IF THEY ARE BUSY:
"I understand. I can email you the short intake form so you can review it whenever you have time.
What is the best email address for me to send it to?"

IF THEY ASK WHERE WINSALOT IS LOCATED:
"Winsalot Corp is a Canadian company based in Ontario, and we work with cleaning providers and customers across Canada."

IF THEY ARE NOT INTERESTED:
"No problem. Thank you for your time.
Would it be alright if we kept your business information on file in case you would like to receive opportunities in the future?"

Record their answer accurately and respect their request.',
  101,
  'Cleaning Provider Recruitment'
);
