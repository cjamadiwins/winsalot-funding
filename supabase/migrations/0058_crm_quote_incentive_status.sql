-- Weekly Agent Incentive (Cleaning CRM half): a qualification review
-- column on quote_requests, mirroring 0057_leadgen_appointment_
-- incentives.sql's approach for the Lead Gen CRM. Deliberately does not
-- touch quote_requests.status (the unconstrained pipeline-progress
-- string documented in migrations 0004/0006 - "Request Submitted" ->
-- ... -> "Sent to Customer" -> "Customer Accepted"/"Customer Declined")
-- or crm_leads.stage (its own separately-tracked CHECK-constrained
-- pipeline column, migration 0007/0024) - this column is a distinct
-- "does this quote count toward the agent's Weekly Incentive" review
-- flag an admin sets explicitly, entirely independent of both.
--
-- Only a quote that was actually sent to the customer
-- (quote_requests.customer_quote_sent_at is not null) *and* has been
-- reviewed here as 'Qualified' counts toward an agent's weekly quota -
-- see lib/crm-incentives.ts. Default null = "not yet reviewed", same
-- non-counting effect as any of the listed non-Qualified values.
--
-- quote_requests already has RLS enabled with zero policies (service-
-- role only - see migrations 0003/0004), so this column is read/written
-- exclusively through admin Server Actions gated by requireAdminUser(),
-- never exposed to a session-scoped client - no RLS policy change is
-- needed or added here.
alter table public.quote_requests
  add column if not exists incentive_status text
    check (incentive_status is null or incentive_status in (
      'Qualified', 'Draft', 'Cancelled', 'Invalid', 'Duplicate', 'Test'
    )),
  add column if not exists incentive_status_set_by uuid references public.crm_users(id) on delete set null,
  add column if not exists incentive_status_set_at timestamptz;

create index if not exists quote_requests_incentive_status_idx on public.quote_requests(incentive_status);
