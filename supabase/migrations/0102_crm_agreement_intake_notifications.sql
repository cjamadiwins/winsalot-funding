-- Growth CRM: complete the Client Agreements / Client Intake admin
-- notification system. Auditing the existing flow found:
--   - Client Intake submission already created an in-app admin
--     notification (client-intake/[token]/actions.ts) but sent no email
--     and linked to the generic onboarding dashboard, not the actual
--     submission.
--   - Client Agreement signing sent an email copy to the admin, but
--     never created any in-app notification at all, and had no
--     human-readable "Agreement Number" to reference in a message.
--   - Neither flow had any way to tell the admin (or retry) if their own
--     notification email failed to send - the client-facing send
--     failures already have this via existing inline errors + a Resend
--     action, but nothing covered the admin's own copy.
--
-- 1. agreement_number: a stable, human-readable identifier, generated
--    the same way as crm_invoices.invoice_number (migration 0091's
--    next_crm_invoice_number pattern). Backfilled for every existing
--    agreement in creation order so none are left without one.
-- 2. admin_notified_at / admin_notification_failed_at /
--    admin_notification_error on crm_client_agreements and
--    crm_intake_submissions: tracks whether the admin-facing
--    signed/submitted notification email actually sent, so a failure
--    can be shown to the admin (with the reason) and retried from that
--    record's own detail page.
--
-- Purely additive - no existing table, column, row, policy, or trigger
-- is dropped or rewritten, and no other CRM feature is touched.

create table if not exists public.crm_agreement_number_counters (
  year int primary key,
  last_number int not null default 0
);

alter table public.crm_agreement_number_counters enable row level security;

create policy "crm_agreement_number_counters_admin_all" on public.crm_agreement_number_counters for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create or replace function public.next_crm_agreement_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from now())::int;
  next_num int;
begin
  insert into public.crm_agreement_number_counters (year, last_number)
  values (current_year, 1)
  on conflict (year) do update set last_number = public.crm_agreement_number_counters.last_number + 1
  returning last_number into next_num;

  return 'AGR-' || current_year || '-' || lpad(next_num::text, 4, '0');
end;
$$;

-- Same rationale as next_crm_invoice_number() (migration 0092): trigger
-- firing is a separate privilege pathway from role EXECUTE grants, and
-- this is also called as a column DEFAULT during a real admin's own
-- session-scoped INSERT, so authenticated must keep EXECUTE; anon has no
-- legitimate reason to call it.
revoke all on function public.next_crm_agreement_number() from public, anon;
grant execute on function public.next_crm_agreement_number() to authenticated;

alter table public.crm_client_agreements
  add column if not exists agreement_number text,
  add column if not exists admin_notified_at timestamptz,
  add column if not exists admin_notification_failed_at timestamptz,
  add column if not exists admin_notification_error text;

do $$
declare
  rec record;
begin
  for rec in select id from public.crm_client_agreements where agreement_number is null order by created_at asc loop
    update public.crm_client_agreements set agreement_number = public.next_crm_agreement_number() where id = rec.id;
  end loop;
end $$;

alter table public.crm_client_agreements
  alter column agreement_number set default public.next_crm_agreement_number(),
  alter column agreement_number set not null;

alter table public.crm_client_agreements
  drop constraint if exists crm_client_agreements_agreement_number_key;
alter table public.crm_client_agreements
  add constraint crm_client_agreements_agreement_number_key unique (agreement_number);

alter table public.crm_intake_submissions
  add column if not exists admin_notified_at timestamptz,
  add column if not exists admin_notification_failed_at timestamptz,
  add column if not exists admin_notification_error text;
