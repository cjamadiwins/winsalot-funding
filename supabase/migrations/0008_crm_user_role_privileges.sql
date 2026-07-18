-- crm_user_role() is only ever meant to be called internally by RLS
-- policies (as the policy definer), not invoked directly over
-- PostgREST's /rest/v1/rpc/crm_user_role endpoint - the Supabase linter
-- flagged it as callable by both anon and authenticated, which would let
-- either role probe an arbitrary uuid's CRM role/active status.
--
-- RLS policy evaluation runs as the querying role, but revoking EXECUTE
-- doesn't break that: Postgres resolves function calls inside a policy at
-- the table owner's privilege level for the purposes of the policy check
-- itself is unaffected by revoking direct EXECUTE from other roles - only
-- direct RPC calls are blocked. authenticated still needs EXECUTE so the
-- policies keep working for logged-in agents/admins; anon and public do
-- not.
revoke execute on function public.crm_user_role(uuid) from public;
revoke execute on function public.crm_user_role(uuid) from anon;
grant execute on function public.crm_user_role(uuid) to authenticated;
