-- Rollback for 20261020120000_security_revoke_unneeded_function_execute.sql (now in supabase/pending-approval/ until approved).
-- Restores the exact EXECUTE grants recorded from production before the change
-- (captured 2026-10-20). Not applied automatically: it lives outside
-- supabase/migrations on purpose. Run it manually only if the migration causes a
-- problem; it re-opens the exposure described in the migration header.

-- Previously granted explicitly to anon + authenticated (no PUBLIC entry).
grant execute on function public.claim_due_crm_marketing_enrollments(integer) to anon, authenticated;
grant execute on function public.claim_due_crm_retention_enrollments(integer) to anon, authenticated;
grant execute on function public.claim_due_crm_retention_followups(integer) to anon, authenticated;
grant execute on function public.crm_subcontractor_visible_clients() to anon;

-- Previously PUBLIC (which includes anon) + authenticated + service_role.
grant execute on function public.next_provider_invoice_number() to public;

-- Previously PUBLIC + anon + authenticated + service_role.
grant execute on function public.crm_retention_cancel_on_client_archive() to public, anon, authenticated;
grant execute on function public.leadgen_conversions_ensure_for_appointment() to public, anon, authenticated;
grant execute on function public.winsalot_chat_enforce_edit_or_soft_delete_only() to public, anon, authenticated;
grant execute on function public.winsalot_chat_enforce_soft_delete_only() to public, anon, authenticated;
grant execute on function public.winsalot_dm_touch_conversation() to public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    grant execute on function public.rls_auto_enable() to public, anon, authenticated;
  end if;
end
$$;
