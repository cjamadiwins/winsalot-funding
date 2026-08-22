-- In-app notifications for the Lead Generation CRM. Mirrors the Cleaning
-- CRM's crm_notifications (migration 0027) exactly, minus the
-- provider_lead_id-specific column (that FK is a cleaning-CRM-only
-- concept) - link_path is generic and free-form, so any future event
-- type (leave requests today, others later) can reuse this table
-- without another migration. Kept as its own table rather than shared
-- with crm_notifications, matching this codebase's existing convention
-- of keeping the two CRMs' tables fully independent.
create table if not exists public.leadgen_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.leadgen_users(id) on delete cascade,
  title text not null,
  body text,
  link_path text,
  is_read boolean not null default false,
  read_at timestamptz
);

create index if not exists leadgen_notifications_user_unread_idx
  on public.leadgen_notifications(user_id, is_read, created_at desc);

alter table public.leadgen_notifications enable row level security;

-- Only the recipient can see or mark their own notification read. No
-- insert/delete policy for authenticated users - written exclusively by
-- the service-role client (src/lib/leadgen-leave-notifications.ts),
-- matching crm_notifications' pattern.
create policy "leadgen_notifications_select_own"
  on public.leadgen_notifications for select
  using (user_id = auth.uid());

create policy "leadgen_notifications_update_own"
  on public.leadgen_notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
