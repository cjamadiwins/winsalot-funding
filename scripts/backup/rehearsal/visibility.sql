-- Test helper (replica only): how many rows each important table shows to the current role.
-- -1 means the role may not read the table at all.
create schema if not exists zz; grant usage on schema zz to public;
create or replace function zz.visible_counts() returns table(tbl text, n bigint) language plpgsql as $f$
declare t text;
begin
  foreach t in array array['leadgen_leads','crm_leads','crm_opportunities','call_list_leads','call_list_segments','call_list_segment_agents','winsalot_appointments','leadgen_appointments','crm_call_logs','leadgen_call_logs','leadgen_campaigns','leadgen_clients','leadgen_campaign_agents','crm_clients','crm_agent_service_assignments','crm_payroll','leadgen_payroll','agent_attendance','leadgen_agent_attendance','crm_lending_partners','crm_users','leadgen_users','crm_notifications','leadgen_notifications','crm_subcontractors','crm_subcontractor_agreements','crm_subcontractor_client_assignments','crm_subcontractor_payments','crm_subcontractor_permissions','crm_subcontractor_training_progress','winsalot_announcements','winsalot_announcement_reads','winsalot_chat_audit_log','winsalot_company_chat_read_state','winsalot_company_messages','winsalot_dm_conversations','winsalot_dm_messages'] loop
    begin execute format('select count(*) from public.%I', t) into n; tbl := t; return next;
    exception when others then tbl := t; n := -1; return next; end;
  end loop;
end $f$;
grant execute on function zz.visible_counts() to public;
