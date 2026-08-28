-- Growth CRM Client Onboarding: exclude internal/test opportunities (e.g.
-- Winsalot Corp's own record, created for internal testing) from ever
-- appearing as a client in the onboarding "Start Onboarding from
-- Opportunity" picker (src/app/admin/(dashboard)/crm/agreements/page.tsx).
--
-- A durable, admin-settable flag rather than a hardcoded name check, so
-- any future internal/test opportunity can be excluded the same way.
-- Purely additive - no existing opportunity row's meaning changes except
-- the one flagged below, and no other crm_opportunities query anywhere
-- else in the app is affected (they don't filter on this column).
alter table public.crm_opportunities
  add column if not exists is_internal_test boolean not null default false;

update public.crm_opportunities
set is_internal_test = true
where business_name ilike 'winsalot corp%';
