-- Security hardening, round 1: remove EXECUTE from roles that never need it.
--
-- Why: Supabase exposes every function in `public` that `anon` / `authenticated`
-- may execute as /rest/v1/rpc/<name>. The functions below are SECURITY DEFINER
-- (they run with the owner's rights), and anyone holding the public anon key
-- could call several of them:
--   * claim_due_crm_marketing_enrollments / claim_due_crm_retention_enrollments /
--     claim_due_crm_retention_followups return whole enrollment / follow-up rows
--     and mark them "claimed" for 30 minutes, which would also stall scheduled
--     sends. They are only called by the server-side jobs through the
--     service-role client (src/lib/crm-marketing-job.ts, crm-retention-job.ts).
--   * next_provider_invoice_number increments the provider invoice counter.
--     Signed-in users must keep it: it is the column default of
--     provider_invoices.invoice_number.
--   * Trigger / event-trigger functions are never meant to be called directly.
--     PostgreSQL checks EXECUTE on a trigger function only when the trigger is
--     created, not when it fires, so revoking it does not affect the triggers.
--
-- Deliberately NOT touched (deferred to phase 2, because row-level-security
-- policies that apply to anon call them): winsalot_is_active_employee,
-- winsalot_is_admin_employee, crm_user_subcontractor_id.
--
-- service_role and the owner keep EXECUTE everywhere. Reversible with
-- supabase/rollbacks/20261020120000_security_revoke_unneeded_function_execute_rollback.sql.
-- Only privileges change; no table, row or policy is modified.

-- Server-only job helpers: service_role (and owner) only.
revoke execute on function public.claim_due_crm_marketing_enrollments(integer) from public, anon, authenticated;
revoke execute on function public.claim_due_crm_retention_enrollments(integer) from public, anon, authenticated;
revoke execute on function public.claim_due_crm_retention_followups(integer) from public, anon, authenticated;

-- Column default for provider invoices: signed-in users and service_role keep it.
revoke execute on function public.next_provider_invoice_number() from public, anon;

-- Not called by any code, policy or view; its body relies on auth.uid(), so it
-- returns nothing without a login anyway.
revoke execute on function public.crm_subcontractor_visible_clients() from public, anon;

-- Trigger functions (fire regardless of EXECUTE) and the event trigger.
revoke execute on function public.crm_retention_cancel_on_client_archive() from public, anon, authenticated;
revoke execute on function public.leadgen_conversions_ensure_for_appointment() from public, anon, authenticated;
revoke execute on function public.winsalot_chat_enforce_edit_or_soft_delete_only() from public, anon, authenticated;
revoke execute on function public.winsalot_chat_enforce_soft_delete_only() from public, anon, authenticated;
revoke execute on function public.winsalot_dm_touch_conversation() from public, anon, authenticated;
-- Created by the Supabase platform (not by this repository's migrations), so only
-- touch it where it exists (it does in production; a rebuilt dev/test database may not have it).
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

-- Self-check: abort (rolling the whole migration back) if anything is still
-- callable by the roles it was meant to lock out, or if a role that must keep
-- access lost it.
do $$
declare
  fn text;
  must_be_closed_to_anon text[] := array[
    'public.claim_due_crm_marketing_enrollments(integer)',
    'public.claim_due_crm_retention_enrollments(integer)',
    'public.claim_due_crm_retention_followups(integer)',
    'public.next_provider_invoice_number()',
    'public.crm_subcontractor_visible_clients()',
    'public.crm_retention_cancel_on_client_archive()',
    'public.leadgen_conversions_ensure_for_appointment()',
    'public.winsalot_chat_enforce_edit_or_soft_delete_only()',
    'public.winsalot_chat_enforce_soft_delete_only()',
    'public.winsalot_dm_touch_conversation()'
  ];
  must_be_closed_to_authenticated text[] := array[
    'public.claim_due_crm_marketing_enrollments(integer)',
    'public.claim_due_crm_retention_enrollments(integer)',
    'public.claim_due_crm_retention_followups(integer)',
    'public.crm_retention_cancel_on_client_archive()',
    'public.leadgen_conversions_ensure_for_appointment()',
    'public.winsalot_chat_enforce_edit_or_soft_delete_only()',
    'public.winsalot_chat_enforce_soft_delete_only()',
    'public.winsalot_dm_touch_conversation()'
  ];
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    if has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') then
      raise exception 'anon or authenticated can still execute public.rls_auto_enable()';
    end if;
  end if;
  foreach fn in array must_be_closed_to_anon loop
    if has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception 'anon can still execute %', fn;
    end if;
  end loop;
  foreach fn in array must_be_closed_to_authenticated loop
    if has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'authenticated can still execute %', fn;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.next_provider_invoice_number()', 'EXECUTE') then
    raise exception 'authenticated lost next_provider_invoice_number (provider invoice default would break)';
  end if;
  if not has_function_privilege('service_role', 'public.claim_due_crm_marketing_enrollments(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_due_crm_retention_enrollments(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_due_crm_retention_followups(integer)', 'EXECUTE') then
    raise exception 'service_role lost a claim_due_* function (scheduled jobs would break)';
  end if;
end
$$;
