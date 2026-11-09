-- Security phase 2 (DRAFT - needs separate approval; apply only after round 1 is applied and quiet).
--
-- Closes the last three anonymously callable SECURITY DEFINER helpers flagged by the advisor:
--   winsalot_is_active_employee(uuid), winsalot_is_admin_employee(uuid), crm_user_subcontractor_id(uuid)
-- They are referenced by 21 row-level-security policies that apply to the PUBLIC role (which includes
-- anon). Revoking EXECUTE from anon alone would turn anonymous requests into "permission denied" errors
-- instead of empty results, so first the 21 policies are narrowed to signed-in users (`TO authenticated`;
-- expressions are untouched), and only then is anon's EXECUTE removed. Anonymous visitors already saw no
-- rows through these policies (the helpers return false/null without a login), so behaviour is unchanged for
-- them, and signed-in users keep exactly the access they have today.
-- Rollback: supabase/rollbacks/20261020140000_security_phase2_rls_helpers_authenticated_only_rollback.sql
-- Only privileges/policy role lists change; no table data is touched.

alter policy crm_call_logs_subcontractor_insert_own on public.crm_call_logs to authenticated;
alter policy crm_subcontractor_agreements_self_insert on public.crm_subcontractor_agreements to authenticated;
alter policy crm_subcontractor_agreements_self_select on public.crm_subcontractor_agreements to authenticated;
alter policy crm_subcontractor_client_assignments_self_select on public.crm_subcontractor_client_assignments to authenticated;
alter policy crm_subcontractor_payments_self_select on public.crm_subcontractor_payments to authenticated;
alter policy crm_subcontractor_permissions_self_select on public.crm_subcontractor_permissions to authenticated;
alter policy crm_subcontractor_training_progress_self_select on public.crm_subcontractor_training_progress to authenticated;
alter policy crm_subcontractor_training_progress_self_update on public.crm_subcontractor_training_progress to authenticated;
alter policy crm_subcontractor_training_progress_self_upsert on public.crm_subcontractor_training_progress to authenticated;
alter policy crm_subcontractors_self_select on public.crm_subcontractors to authenticated;
alter policy winsalot_announcement_reads_own on public.winsalot_announcement_reads to authenticated;
alter policy winsalot_announcements_insert_admin_only on public.winsalot_announcements to authenticated;
alter policy winsalot_announcements_select_active_employees on public.winsalot_announcements to authenticated;
alter policy winsalot_announcements_update_admin_only on public.winsalot_announcements to authenticated;
alter policy winsalot_chat_audit_log_admin_select on public.winsalot_chat_audit_log to authenticated;
alter policy winsalot_company_chat_read_state_own on public.winsalot_company_chat_read_state to authenticated;
alter policy winsalot_company_messages_delete_own_recent_or_admin on public.winsalot_company_messages to authenticated;
alter policy winsalot_company_messages_insert_own on public.winsalot_company_messages to authenticated;
alter policy winsalot_company_messages_select_active_employees on public.winsalot_company_messages to authenticated;
alter policy winsalot_dm_conversations_insert_participant on public.winsalot_dm_conversations to authenticated;
alter policy winsalot_dm_messages_insert_participant on public.winsalot_dm_messages to authenticated;

revoke execute on function public.winsalot_is_active_employee(uuid) from public, anon;
revoke execute on function public.winsalot_is_admin_employee(uuid) from public, anon;
revoke execute on function public.crm_user_subcontractor_id(uuid) from public, anon;

-- Self-check: abort (rolling everything back) unless anon is locked out, signed-in users and the server keep
-- access, and no policy still applies to PUBLIC while using these helpers.
do $$
declare fn text;
begin
  foreach fn in array array['public.winsalot_is_active_employee(uuid)', 'public.winsalot_is_admin_employee(uuid)', 'public.crm_user_subcontractor_id(uuid)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') then raise exception 'anon can still execute %', fn; end if;
    if not has_function_privilege('authenticated', fn, 'EXECUTE') then raise exception 'authenticated lost %', fn; end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then raise exception 'service_role lost %', fn; end if;
  end loop;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and roles = '{public}'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(winsalot_is_active_employee|winsalot_is_admin_employee|crm_user_subcontractor_id)'
  ) then
    raise exception 'a PUBLIC policy still uses one of the helper functions';
  end if;
end
$$;
