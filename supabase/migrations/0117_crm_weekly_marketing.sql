-- Growth CRM weekly prospect marketing.
--
-- This is deliberately built on crm_opportunities instead of creating a
-- second contact list. A contacted business therefore keeps one identity,
-- owner, service classification, activity history, and suppression status
-- throughout the Growth CRM.

create table if not exists public.crm_marketing_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_type text not null check (campaign_type in (
    'lead_generation', 'business_financing', 'both_services'
  )),
  sequence_number integer not null check (sequence_number between 1 and 52),
  subject text not null check (length(trim(subject)) > 0),
  body text not null check (length(trim(body)) > 0),
  cta_label text not null default 'Schedule a call' check (length(trim(cta_label)) > 0),
  active boolean not null default true,
  unique (campaign_type, sequence_number)
);

create table if not exists public.crm_marketing_enrollments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opportunity_id uuid not null unique references public.crm_opportunities(id) on delete cascade,
  campaign_type text not null check (campaign_type in (
    'lead_generation', 'business_financing', 'both_services'
  )),
  status text not null default 'active' check (status in (
    'active', 'paused', 'stopped', 'unsubscribed'
  )),
  consent_basis text not null check (consent_basis in ('express', 'implied')),
  consent_notes text not null check (length(trim(consent_notes)) > 0),
  consent_recorded_at timestamptz not null default now(),
  consent_recorded_by uuid references public.crm_users(id) on delete set null,
  cadence_days integer not null default 7 check (cadence_days >= 7),
  next_send_at timestamptz not null default now(),
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  last_error text,
  claimed_at timestamptz,
  claim_token uuid,
  paused_at timestamptz,
  stopped_at timestamptz,
  created_by uuid references public.crm_users(id) on delete set null
);

create table if not exists public.crm_marketing_deliveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  enrollment_id uuid not null references public.crm_marketing_enrollments(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  template_id uuid references public.crm_marketing_templates(id) on delete set null,
  occurrence_key text not null,
  scheduled_for timestamptz not null,
  to_email text not null,
  subject text not null,
  resend_email_id text unique,
  status text not null default 'sending' check (status in (
    'sending', 'sent', 'delivered', 'delayed', 'bounced',
    'complained', 'opened', 'clicked', 'failed'
  )),
  status_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  sent_at timestamptz,
  delivered_at timestamptz,
  delayed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  failed_at timestamptz,
  error_detail text,
  unique (enrollment_id, occurrence_key)
);

create index if not exists crm_marketing_enrollments_due_idx
  on public.crm_marketing_enrollments(next_send_at)
  where status = 'active';
create index if not exists crm_marketing_enrollments_status_idx
  on public.crm_marketing_enrollments(status);
create index if not exists crm_marketing_deliveries_enrollment_idx
  on public.crm_marketing_deliveries(enrollment_id, created_at desc);
create index if not exists crm_marketing_deliveries_opportunity_idx
  on public.crm_marketing_deliveries(opportunity_id, created_at desc);

alter table public.crm_marketing_templates enable row level security;
alter table public.crm_marketing_enrollments enable row level security;
alter table public.crm_marketing_deliveries enable row level security;

create policy "crm_marketing_templates_admin_all"
  on public.crm_marketing_templates for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_marketing_enrollments_admin_all"
  on public.crm_marketing_enrollments for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create policy "crm_marketing_deliveries_admin_select"
  on public.crm_marketing_deliveries for select
  using (public.crm_user_role(auth.uid()) = 'admin');

-- Atomically claims due work so duplicate cron invocations from two Vercel
-- projects, retries, or overlapping runs can never send the same weekly
-- occurrence twice. Only the service-role cron worker may execute it.
create or replace function public.claim_due_crm_marketing_enrollments(p_limit integer default 50)
returns setof public.crm_marketing_enrollments
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select e.id
    from public.crm_marketing_enrollments e
    where e.status = 'active'
      and e.next_send_at <= now()
      and (e.claimed_at is null or e.claimed_at < now() - interval '30 minutes')
    order by e.next_send_at asc
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.crm_marketing_enrollments e
     set claimed_at = now(),
         claim_token = gen_random_uuid(),
         updated_at = now()
    from due
   where e.id = due.id
  returning e.*;
end;
$$;

revoke all on function public.claim_due_crm_marketing_enrollments(integer) from public;
grant execute on function public.claim_due_crm_marketing_enrollments(integer) to service_role;

insert into public.crm_marketing_templates (campaign_type, sequence_number, subject, body, cta_label)
values
  ('lead_generation', 1, 'A steady way to build your sales pipeline', E'Hi {{first_name}},\n\nKeeping a sales pipeline active takes consistent outreach and follow-up. Winsalot Corp helps businesses identify suitable prospects, start B2B conversations, and book qualified appointments for their sales team.\n\nIf attracting more business conversations is a priority, we would be glad to learn about your goals.', 'Discuss lead generation'),
  ('lead_generation', 2, 'Turning outreach into qualified conversations', E'Hi {{first_name}},\n\nMany businesses know who they want to reach but do not have enough time for consistent prospecting. Winsalot Corp can support the outreach process—from identifying suitable businesses to qualifying interest and arranging appointments.\n\nOur approach is tailored to your target industries, locations, and ideal customer profile.', 'Schedule a short call'),
  ('lead_generation', 3, 'Extra support for your sales pipeline', E'Hi {{first_name}},\n\nA dependable outreach process can help your team spend more time speaking with interested decision-makers. Winsalot Corp provides B2B lead generation and appointment-setting support based on your business goals.\n\nThere are no guaranteed results, but we build each campaign around clear targeting and transparent reporting.', 'Learn how it works'),
  ('lead_generation', 4, 'Would more qualified appointments help?', E'Hi {{first_name}},\n\nI wanted to check whether lead generation is still something {{business_name}} may want to explore. Winsalot Corp can help with prospect research, outbound contact, qualification, and appointment setting.\n\nIf the timing is not right, there is no obligation. You can also reply with any questions.', 'Talk with Winsalot'),

  ('business_financing', 1, 'Business funding support when you need it', E'Hi {{first_name}},\n\nWinsalot Corp helps established Canadian businesses explore potential financing options through our lending partners. Our support is free to applicants, and compensation may be paid by a lender only if a transaction funds.\n\nApproval is never guaranteed and depends on the lender’s requirements and review.', 'Discuss business financing'),
  ('business_financing', 2, 'Preparing for a business funding conversation', E'Hi {{first_name}},\n\nWhen a business explores financing, lenders commonly review factors such as time in business, monthly revenue, business structure, and recent bank statements. Winsalot Corp can help you understand the information that may be requested and connect you with suitable lending partners.\n\nThere is no cost to ask questions or review possible next steps.', 'Schedule a short call'),
  ('business_financing', 3, 'Funding options for established businesses', E'Hi {{first_name}},\n\nDifferent businesses seek financing for working capital, equipment, inventory, expansion, or other operating needs. Winsalot Corp can help identify lending partners whose requirements may fit your situation.\n\nOffers, rates, and approvals are determined solely by the lender after review.', 'Explore possible options'),
  ('business_financing', 4, 'Questions about business financing?', E'Hi {{first_name}},\n\nI wanted to check whether business financing is still relevant for {{business_name}}. If you would like to discuss your needs, Winsalot Corp can explain the process and the documents lenders commonly request.\n\nThere is no obligation, and our support is free to applicants.', 'Talk with Winsalot'),

  ('both_services', 1, 'Two ways to support your business growth', E'Hi {{first_name}},\n\nWinsalot Corp supports businesses in two practical areas: generating qualified B2B sales conversations and exploring possible business financing through lending partners.\n\nIf either area is relevant to {{business_name}}, we would be glad to learn more about your goals.', 'Discuss your business goals'),
  ('both_services', 2, 'Support for pipeline and cash-flow goals', E'Hi {{first_name}},\n\nWhether the immediate priority is reaching more prospects or exploring financing, Winsalot Corp can help you understand the next steps. Lead-generation campaigns are tailored to your target market, while financing options depend on lender review and eligibility.\n\nWe will only focus on the service that is useful to your business.', 'Schedule a short call'),
  ('both_services', 3, 'Which growth priority matters most right now?', E'Hi {{first_name}},\n\nSome businesses need more qualified conversations; others need working capital for their next stage. Winsalot Corp can support lead generation and help established businesses explore financing options through lending partners.\n\nNeither appointments nor financing approval can be guaranteed, and we will always explain the process clearly.', 'Explore the right next step'),
  ('both_services', 4, 'Still considering support for {{business_name}}?', E'Hi {{first_name}},\n\nI wanted to check whether lead generation or business financing support is still relevant for {{business_name}}. If so, we can have a short conversation about your current goals and determine whether either service may fit.\n\nThere is no obligation, and you can reply directly with any questions.', 'Talk with Winsalot')
on conflict (campaign_type, sequence_number) do nothing;
