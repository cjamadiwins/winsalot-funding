-- Rollback for the phase 2 draft: puts the 21 policies back on PUBLIC and restores the helpers' prior
-- EXECUTE grants (PUBLIC + anon + authenticated + service_role for the two winsalot_* helpers; anon +
-- authenticated + service_role for crm_user_subcontractor_id). Re-opens the exposure the draft closes.
alter policy crm_call_logs_subcontractor_insert_own on public.crm_call_logs to public;
alter policy crm_subcontractor_agreements_self_insert on public.crm_subcontractor_agreements to public;
alter policy crm_subcontractor_agreements_self_select on public.crm_subcontractor_agreements to public;
alter policy crm_subcontractor_client_assignments_self_select on public.crm_subcontractor_client_assignments to public;
alter policy crm_subcontractor_payments_self_select on public.crm_subcontractor_payments to public;
alter policy crm_subcontractor_permissions_self_select on public.crm_subcontractor_permissions to public;
alter policy crm_subcontractor_training_progress_self_select on public.crm_subcontractor_training_progress to public;
alter policy crm_subcontractor_training_progress_self_update on public.crm_subcontractor_training_progress to public;
alter policy crm_subcontractor_training_progress_self_upsert on public.crm_subcontractor_training_progress to public;
alter policy crm_subcontractors_self_select on public.crm_subcontractors to public;
alter policy winsalot_announcement_reads_own on public.winsalot_announcement_reads to public;
alter policy winsalot_announcements_insert_admin_only on public.winsalot_announcements to public;
alter policy winsalot_announcements_select_active_employees on public.winsalot_announcements to public;
alter policy winsalot_announcements_update_admin_only on public.winsalot_announcements to public;
alter policy winsalot_chat_audit_log_admin_select on public.winsalot_chat_audit_log to public;
alter policy winsalot_company_chat_read_state_own on public.winsalot_company_chat_read_state to public;
alter policy winsalot_company_messages_delete_own_recent_or_admin on public.winsalot_company_messages to public;
alter policy winsalot_company_messages_insert_own on public.winsalot_company_messages to public;
alter policy winsalot_company_messages_select_active_employees on public.winsalot_company_messages to public;
alter policy winsalot_dm_conversations_insert_participant on public.winsalot_dm_conversations to public;
alter policy winsalot_dm_messages_insert_participant on public.winsalot_dm_messages to public;

grant execute on function public.winsalot_is_active_employee(uuid) to public, anon;
grant execute on function public.winsalot_is_admin_employee(uuid) to public, anon;
grant execute on function public.crm_user_subcontractor_id(uuid) to anon;
