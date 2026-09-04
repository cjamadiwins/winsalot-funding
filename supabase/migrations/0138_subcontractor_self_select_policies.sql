-- Fixes a gap left by migration 0136: crm_subcontractors and
-- crm_subcontractor_payments (both pre-existing tables from 0135) only ever
-- got an admin-all RLS policy - there was no self-select policy letting a
-- signed-in subcontractor (role='subcontractor') read their own profile row
-- or their own payment history, which the subcontractor portal
-- (src/app/subcontractor/(dashboard)/*) needs for its dashboard, agreement,
-- and pay pages. Every other new subcontractor table added in 0136 already
-- got a matching self-select policy - this migration brings these two
-- tables in line with that same pattern. Additive only: the existing
-- crm_subcontractors_admin_all / crm_subcontractor_payments_admin_all
-- policies (0135) are untouched, so admin access is unaffected.

create policy "crm_subcontractors_self_select"
  on public.crm_subcontractors for select
  using (id = public.crm_user_subcontractor_id(auth.uid()));

create policy "crm_subcontractor_payments_self_select"
  on public.crm_subcontractor_payments for select
  using (subcontractor_id = public.crm_user_subcontractor_id(auth.uid()));
