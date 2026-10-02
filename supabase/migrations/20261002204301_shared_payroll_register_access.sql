-- Read the original records in place. No copies, backfill, or financial changes.
-- Auth predicates have no caller-supplied identity and bypass user-table RLS only.
create function public.winsalot_payroll_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.crm_users where id = (select auth.uid()) and role = 'admin' and active)
      or exists(select 1 from public.leadgen_users where id = (select auth.uid()) and role = 'admin' and active);
$$;
create function public.winsalot_payroll_agent() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.crm_users where id = (select auth.uid()) and role = 'agent' and active)
      or exists(select 1 from public.leadgen_users where id = (select auth.uid()) and role = 'agent' and active);
$$;
revoke all on function public.winsalot_payroll_admin(), public.winsalot_payroll_agent() from public, anon;
grant execute on function public.winsalot_payroll_admin(), public.winsalot_payroll_agent() to authenticated, service_role;
create policy shared_payroll_admin_read on public.crm_users for select to authenticated using (role = 'agent' and (select public.winsalot_payroll_admin()));
create policy shared_payroll_admin_read on public.leadgen_users for select to authenticated using (role = 'agent' and (select public.winsalot_payroll_admin()));
create policy shared_payroll_read on public.crm_payroll for select to authenticated
using ((select public.winsalot_payroll_admin()) or (agent_id = (select auth.uid()) and (select public.winsalot_payroll_agent())));
create policy shared_payroll_read on public.leadgen_payroll for select to authenticated
using ((select public.winsalot_payroll_admin()) or (agent_id = (select auth.uid()) and (select public.winsalot_payroll_agent())));
create policy shared_payroll_admin_read on public.crm_payroll_audit_log for select to authenticated using ((select public.winsalot_payroll_admin()));
create policy shared_payroll_admin_read on public.leadgen_payroll_audit_log for select to authenticated using ((select public.winsalot_payroll_admin()));
create view public.winsalot_payroll with (security_invoker = true) as
select p.id, p.agent_id, p.pay_period_start, p.pay_period_end, p.payday, p.standard_biweekly_pay, p.standard_working_days, p.standard_biweekly_wage, p.standard_paid_hours, p.regular_paid_hours, p.unpaid_hours, p.approved_paid_leave_hours, p.days_present, p.approved_paid_days, p.unpaid_absence_days, p.total_payable_days, p.base_pay_earned, p.internet_allowance, p.bonus_commission, p.other_additions, p.holiday_pay, p.deductions, p.total_pay, p.status, p.actual_payment_date, p.payment_method, p.admin_notes, p.approved_at, case when (select public.winsalot_payroll_admin()) then p.approved_by else null end as approved_by, p.reopened_at, case when (select public.winsalot_payroll_admin()) then p.reopened_by else null end as reopened_by, case when (select public.winsalot_payroll_admin()) then p.reopen_reason else null end as reopen_reason, p.created_at, p.updated_at, 'growth'::text as source_crm, (select u.payroll_currency from public.crm_users u where u.id = p.agent_id) as payroll_currency from public.crm_payroll p
union all
select p.id, p.agent_id, p.pay_period_start, p.pay_period_end, p.payday, p.standard_biweekly_pay, p.standard_working_days, p.standard_biweekly_wage, p.standard_paid_hours, p.regular_paid_hours, p.unpaid_hours, p.approved_paid_leave_hours, p.days_present, p.approved_paid_days, p.unpaid_absence_days, p.total_payable_days, p.base_pay_earned, p.internet_allowance, p.bonus_commission, p.other_additions, p.holiday_pay, p.deductions, p.total_pay, p.status, p.actual_payment_date, p.payment_method, p.admin_notes, p.approved_at, case when (select public.winsalot_payroll_admin()) then p.approved_by else null end as approved_by, p.reopened_at, case when (select public.winsalot_payroll_admin()) then p.reopened_by else null end as reopened_by, case when (select public.winsalot_payroll_admin()) then p.reopen_reason else null end as reopen_reason, p.created_at, p.updated_at, 'leadgen'::text as source_crm, (select u.payroll_currency from public.leadgen_users u where u.id = p.agent_id) as payroll_currency from public.leadgen_payroll p;
create view public.winsalot_payroll_audit_log with (security_invoker = true) as
select a.*, 'growth'::text as source_crm from public.crm_payroll_audit_log a
union all
select a.*, 'leadgen'::text as source_crm from public.leadgen_payroll_audit_log a;
-- One identity, chosen consistently; retains all existing employee rows in place.
create view public.winsalot_payroll_agents with (security_invoker = true) as
select distinct on (id) id, full_name, email, payroll_currency, source_crm
from (
 select id, full_name, email, payroll_currency, 'growth'::text as source_crm from public.crm_users where role = 'agent'
 union all
 select id, full_name, email, payroll_currency, 'leadgen'::text as source_crm from public.leadgen_users where role = 'agent'
) identities order by id, source_crm;
revoke all on public.winsalot_payroll, public.winsalot_payroll_audit_log, public.winsalot_payroll_agents from public, anon, authenticated, service_role;
grant select on public.winsalot_payroll, public.winsalot_payroll_audit_log, public.winsalot_payroll_agents to authenticated, service_role;
-- Fail safely if duplicate historical periods ever exist; do not rewrite them.
do $$ begin
 if exists (
   select agent_id, pay_period_start, pay_period_end from (
    select agent_id, pay_period_start, pay_period_end from public.crm_payroll
    union all select agent_id, pay_period_start, pay_period_end from public.leadgen_payroll
   ) p group by agent_id, pay_period_start, pay_period_end having count(*) > 1
 ) or exists (select agent_id, payday from (select agent_id, payday from public.crm_payroll union all select agent_id, payday from public.leadgen_payroll) p group by agent_id, payday having count(*) > 1) then raise exception 'Duplicate historical payroll periods require review before shared access'; end if;
end $$;
-- Serialize checks across both stores, including simultaneous CRM submissions.
-- Definer access is needed to detect a conflicting row hidden by source RLS.
create function public.guard_shared_payroll_period() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winsalot-payroll:' || new.agent_id::text, 0));
 if exists(select 1 from public.crm_payroll p where p.agent_id = new.agent_id and (p.payday = new.payday or (p.pay_period_start = new.pay_period_start and p.pay_period_end = new.pay_period_end)) and not (tg_table_name = 'crm_payroll' and p.id = new.id))
 or exists(select 1 from public.leadgen_payroll p where p.agent_id = new.agent_id and (p.payday = new.payday or (p.pay_period_start = new.pay_period_start and p.pay_period_end = new.pay_period_end)) and not (tg_table_name = 'leadgen_payroll' and p.id = new.id)) then
  raise exception using errcode = '23505', message = 'A shared payroll record already exists for this agent and pay period. Open the existing record.';
 end if;
 return new;
end $$;
revoke all on function public.guard_shared_payroll_period() from public, anon, authenticated;
create trigger shared_payroll_period_guard before insert or update of agent_id, pay_period_start, pay_period_end, payday on public.crm_payroll for each row execute function public.guard_shared_payroll_period();
create trigger shared_payroll_period_guard before insert or update of agent_id, pay_period_start, pay_period_end, payday on public.leadgen_payroll for each row execute function public.guard_shared_payroll_period();
