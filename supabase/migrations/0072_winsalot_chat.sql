-- Employee Chat: a single subsystem shared by both CRMs, not two
-- disconnected ones. Both CRMs already live in this one Supabase project
-- (see crm_users / leadgen_users), and the same real person already gets
-- the same auth.users.id in both tables - chat identity is just that id,
-- with no new "users" table of its own, so nobody can ever appear twice.
--
-- winsalot_is_active_employee()/winsalot_is_admin_employee() check BOTH
-- crm_users and leadgen_users (active/admin in *either* counts), so every
-- RLS policy below is correct regardless of which CRM's page the request
-- came from - there is deliberately no per-CRM branching anywhere in this
-- migration. Mirrors the crm_user_role()/leadgen_user_role() security
-- definer pattern already used throughout this app.

create or replace function public.winsalot_is_active_employee(uid uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.crm_users where id = uid and active and role in ('admin', 'agent')
  ) or exists (
    select 1 from public.leadgen_users where id = uid and active and role in ('admin', 'agent')
  );
$$;

create or replace function public.winsalot_is_admin_employee(uid uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.crm_users where id = uid and active and role = 'admin'
  ) or exists (
    select 1 from public.leadgen_users where id = uid and active and role = 'admin'
  );
$$;

-- Shared "soft delete (and, for announcements, pin) only" guard: once a
-- message/announcement exists, an UPDATE may change deleted_at/deleted_by/
-- deleted_by_name/pinned and nothing else - not the content, not the
-- sender. One trigger function reused by all three moderatable tables
-- below (their extra columns differ, but to_jsonb() diffing handles that
-- generically), same rationale as enforce_agent_attendance_close_only_update
-- elsewhere in this app.
create or replace function public.winsalot_chat_enforce_soft_delete_only()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (to_jsonb(new) - 'deleted_at' - 'deleted_by' - 'deleted_by_name' - 'pinned')
     is distinct from
     (to_jsonb(old) - 'deleted_at' - 'deleted_by' - 'deleted_by_name' - 'pinned')
  then
    raise exception 'Only deletion (or, for announcements, pinning) may change after a message is posted.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Company Chat: one global channel, every active employee (both CRMs)
-- ---------------------------------------------------------------------
create table public.winsalot_company_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  sender_is_admin boolean not null default false,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_name text
);

create index winsalot_company_messages_created_idx on public.winsalot_company_messages(created_at desc);

alter table public.winsalot_company_messages enable row level security;

create policy "winsalot_company_messages_select_active_employees"
  on public.winsalot_company_messages for select
  using (public.winsalot_is_active_employee(auth.uid()));

create policy "winsalot_company_messages_insert_own"
  on public.winsalot_company_messages for insert
  with check (
    sender_id = auth.uid()
    and public.winsalot_is_active_employee(auth.uid())
    and deleted_at is null and deleted_by is null and deleted_by_name is null
  );

-- Senders may soft-delete their own message within 15 minutes; admins may
-- soft-delete anyone's message at any time (moderation). No one may edit
-- message content itself - the trigger below blocks that regardless of
-- which branch of this USING clause let the UPDATE through.
create policy "winsalot_company_messages_delete_own_recent_or_admin"
  on public.winsalot_company_messages for update
  using (
    (sender_id = auth.uid() and created_at > now() - interval '15 minutes')
    or public.winsalot_is_admin_employee(auth.uid())
  )
  with check (deleted_at is not null and deleted_by = auth.uid());

create trigger winsalot_company_messages_soft_delete_only
  before update on public.winsalot_company_messages
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

-- ---------------------------------------------------------------------
-- Direct Messages: private, exactly two participants, no admin access
-- ---------------------------------------------------------------------
create table public.winsalot_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  participant_one uuid not null references auth.users(id) on delete cascade,
  participant_two uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  constraint winsalot_dm_conversations_distinct_participants check (participant_one <> participant_two),
  -- Canonical ordering (smaller uuid first) so the same pair can never
  -- get two conversation rows depending on who started it.
  constraint winsalot_dm_conversations_ordered_pair check (participant_one < participant_two),
  constraint winsalot_dm_conversations_unique_pair unique (participant_one, participant_two)
);

alter table public.winsalot_dm_conversations enable row level security;

create policy "winsalot_dm_conversations_select_participant"
  on public.winsalot_dm_conversations for select
  using (auth.uid() in (participant_one, participant_two));

create policy "winsalot_dm_conversations_insert_participant"
  on public.winsalot_dm_conversations for insert
  with check (
    auth.uid() in (participant_one, participant_two)
    and public.winsalot_is_active_employee(participant_one)
    and public.winsalot_is_active_employee(participant_two)
  );

-- last_message_at is maintained by a trigger (below), not client updates -
-- deliberately no update/delete policy for conversations at all.

create table public.winsalot_dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.winsalot_dm_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_name text
);

create index winsalot_dm_messages_conversation_idx on public.winsalot_dm_messages(conversation_id, created_at desc);

alter table public.winsalot_dm_messages enable row level security;

-- Only the two participants can ever see a DM - not admins, not anyone
-- else. This is the "admins must not silently access private messages"
-- requirement enforced at the database level, not just in the UI.
create policy "winsalot_dm_messages_select_participant"
  on public.winsalot_dm_messages for select
  using (
    exists (
      select 1 from public.winsalot_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

create policy "winsalot_dm_messages_insert_participant"
  on public.winsalot_dm_messages for insert
  with check (
    sender_id = auth.uid()
    and public.winsalot_is_active_employee(auth.uid())
    and deleted_at is null and deleted_by is null and deleted_by_name is null
    and exists (
      select 1 from public.winsalot_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

-- Only the sender may delete their own recent DM - no admin override here
-- at all, unlike company messages/announcements.
create policy "winsalot_dm_messages_delete_own_recent"
  on public.winsalot_dm_messages for update
  using (
    sender_id = auth.uid() and created_at > now() - interval '15 minutes'
    and exists (
      select 1 from public.winsalot_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  )
  with check (deleted_at is not null and deleted_by = auth.uid());

create trigger winsalot_dm_messages_soft_delete_only
  before update on public.winsalot_dm_messages
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create or replace function public.winsalot_dm_touch_conversation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.winsalot_dm_conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger winsalot_dm_messages_touch_conversation
  after insert on public.winsalot_dm_messages
  for each row execute function public.winsalot_dm_touch_conversation();

create table public.winsalot_dm_read_state (
  conversation_id uuid not null references public.winsalot_dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.winsalot_dm_read_state enable row level security;

create policy "winsalot_dm_read_state_own"
  on public.winsalot_dm_read_state for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.winsalot_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

-- ---------------------------------------------------------------------
-- Admin Announcements: admin-only write, every active employee reads
-- ---------------------------------------------------------------------
create table public.winsalot_announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  pinned boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_name text
);

create index winsalot_announcements_pinned_created_idx on public.winsalot_announcements(pinned desc, created_at desc);

alter table public.winsalot_announcements enable row level security;

create policy "winsalot_announcements_select_active_employees"
  on public.winsalot_announcements for select
  using (public.winsalot_is_active_employee(auth.uid()));

create policy "winsalot_announcements_insert_admin_only"
  on public.winsalot_announcements for insert
  with check (
    sender_id = auth.uid()
    and public.winsalot_is_admin_employee(auth.uid())
    and deleted_at is null and deleted_by is null and deleted_by_name is null
  );

create policy "winsalot_announcements_update_admin_only"
  on public.winsalot_announcements for update
  using (public.winsalot_is_admin_employee(auth.uid()))
  with check (public.winsalot_is_admin_employee(auth.uid()));

create trigger winsalot_announcements_soft_delete_only
  before update on public.winsalot_announcements
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create table public.winsalot_announcement_reads (
  announcement_id uuid not null references public.winsalot_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.winsalot_announcement_reads enable row level security;

create policy "winsalot_announcement_reads_own"
  on public.winsalot_announcement_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.winsalot_is_active_employee(auth.uid()));

-- ---------------------------------------------------------------------
-- Company Chat read-state (one row per employee, for the unread badge)
-- ---------------------------------------------------------------------
create table public.winsalot_company_chat_read_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.winsalot_company_chat_read_state enable row level security;

create policy "winsalot_company_chat_read_state_own"
  on public.winsalot_company_chat_read_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.winsalot_is_active_employee(auth.uid()));

-- ---------------------------------------------------------------------
-- Chat notifications: shared across both CRMs (DM received, announcement
-- posted), independent of crm_notifications/leadgen_notifications since
-- an employee may only exist in one of those two tables.
-- ---------------------------------------------------------------------
create table public.winsalot_chat_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('dm', 'announcement')),
  title text not null,
  body text,
  link_path text,
  is_read boolean not null default false,
  read_at timestamptz
);

create index winsalot_chat_notifications_user_unread_idx
  on public.winsalot_chat_notifications(user_id, is_read, created_at desc);

alter table public.winsalot_chat_notifications enable row level security;

create policy "winsalot_chat_notifications_select_own"
  on public.winsalot_chat_notifications for select
  using (user_id = auth.uid());

create policy "winsalot_chat_notifications_update_own"
  on public.winsalot_chat_notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No insert policy for any signed-in role - written exclusively by the
-- service-role client from trusted Server Action code (src/lib/chat-actions.ts),
-- same convention as crm_notifications/leadgen_notifications.

-- ---------------------------------------------------------------------
-- Moderation activity log: append-only, admin-only, records every
-- company-message/announcement removal and announcement creation.
-- ---------------------------------------------------------------------
create table public.winsalot_chat_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null check (action in (
    'company_message_removed', 'announcement_removed', 'announcement_created',
    'announcement_pinned', 'announcement_unpinned'
  )),
  target_id uuid not null,
  target_sender_id uuid,
  target_sender_name text,
  performed_by uuid references auth.users(id) on delete set null,
  performed_by_name text not null,
  reason text
);

alter table public.winsalot_chat_audit_log enable row level security;

create policy "winsalot_chat_audit_log_admin_select"
  on public.winsalot_chat_audit_log for select
  using (public.winsalot_is_admin_employee(auth.uid()));

-- No insert policy for any signed-in role - service-role only.

-- ---------------------------------------------------------------------
-- Realtime: RLS-filtered postgres_changes for live message delivery.
-- Each subscriber only ever receives change events for rows their own
-- SELECT policy would return - a non-participant's client is never sent
-- another pair's DM rows, exactly like a direct query would behave.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.winsalot_company_messages;
alter publication supabase_realtime add table public.winsalot_dm_messages;
alter publication supabase_realtime add table public.winsalot_announcements;
