-- Follow-up to 0092: `revoke execute ... from anon` on
-- next_crm_invoice_number() alone turned out to be a no-op, because
-- PostgreSQL grants EXECUTE on newly created functions to the implicit
-- PUBLIC pseudo-role by default, and anon (like every role) inherits
-- PUBLIC's privileges unless a role-specific REVOKE targets PUBLIC itself.
-- Revoking only "from anon" left the PUBLIC grant in place, so anon could
-- still call it. Fix: revoke the PUBLIC default grant, then grant EXECUTE
-- back explicitly to authenticated only (real admin inserts rely on this
-- function firing as the invoice_number column DEFAULT).

revoke execute on function public.next_crm_invoice_number() from public;
grant execute on function public.next_crm_invoice_number() to authenticated;
