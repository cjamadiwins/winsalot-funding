-- Extends crm_lead_emails (Resend email delivery tracking, migration
-- 0022) and crm_opportunities to work together, the same way migration
-- 0082 extended crm_activities/crm_followups. lead_id stays as-is for
-- historical rows tied to the now-frozen crm_leads; opportunity_id is what
-- new opportunity-related emails (e.g. a booked-consultation confirmation)
-- use going forward.
alter table public.crm_lead_emails
  alter column lead_id drop not null,
  add column if not exists opportunity_id uuid references public.crm_opportunities(id) on delete cascade;

-- crm_lead_emails already has a two-way "exactly one of lead_id/
-- provider_lead_id" constraint (crm_lead_emails_exactly_one_target,
-- migration 0026). Replace it with a three-way version that adds
-- opportunity_id as a legitimate third target, matching the pattern
-- crm_activities/crm_followups already use.
alter table public.crm_lead_emails drop constraint if exists crm_lead_emails_exactly_one_target;
alter table public.crm_lead_emails add constraint crm_lead_emails_exactly_one_target
  check (
    (case when lead_id is not null then 1 else 0 end)
    + (case when opportunity_id is not null then 1 else 0 end)
    + (case when provider_lead_id is not null then 1 else 0 end)
    = 1
  );

create index if not exists crm_lead_emails_opportunity_idx on public.crm_lead_emails(opportunity_id, created_at desc);

-- lead_id is cleared in the same statement (not left set alongside
-- opportunity_id) to satisfy the exactly-one constraint above - see
-- migration 0083's identical treatment of crm_activities/crm_followups
-- for why nothing is lost by doing this (a migrated opportunity shares
-- its source crm_leads row's id).
update public.crm_lead_emails e
set opportunity_id = e.lead_id, lead_id = null
where e.lead_id is not null
  and e.opportunity_id is null
  and exists (select 1 from public.crm_opportunities o where o.id = e.lead_id);

-- Mirrors crm_leads.last_email_status/_at/_type/_to (added by migration
-- 0022) onto crm_opportunities, same denormalized "latest email status"
-- convenience column, kept in sync by the Resend webhook handler
-- (service-role client) exactly like the crm_leads version.
alter table public.crm_opportunities
  add column if not exists last_email_status text check (last_email_status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'clicked'
  )),
  add column if not exists last_email_status_at timestamptz,
  add column if not exists last_email_type text,
  add column if not exists last_email_to text;
