-- Security hardening for functions introduced by 0091_crm_clients_and_invoices.
--
-- The Supabase security advisor flagged that these SECURITY DEFINER
-- functions were callable directly via PostgREST RPC
-- (/rest/v1/rpc/<function_name>) by anon and/or authenticated, which is
-- unintended exposure:
--
--   * crm_invoices_recalc_line_items / crm_invoices_recalc_payments are
--     AFTER-trigger-only functions. Trigger firing is a separate privilege
--     pathway from role EXECUTE grants, so revoking EXECUTE entirely does
--     not stop the triggers from working - it only blocks calling them
--     directly as an RPC endpoint.
--
--   * next_crm_invoice_number() is called as the invoice_number column
--     DEFAULT during a real admin's own session-scoped INSERT, which is
--     gated by the EXECUTING role's own privileges - so authenticated
--     must keep EXECUTE. Only the anonymous role has no legitimate reason
--     to call it.
--
--   * crm_agent_visible_clients() is the sole RPC agents use to read their
--     assigned active clients (see 0091). authenticated must keep EXECUTE;
--     anon has no legitimate reason to call it.

revoke all on function public.crm_invoices_recalc_line_items() from public, anon, authenticated;
revoke all on function public.crm_invoices_recalc_payments() from public, anon, authenticated;

revoke execute on function public.next_crm_invoice_number() from anon;
revoke execute on function public.crm_agent_visible_clients() from anon;
