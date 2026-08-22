-- Urgent fix: the shared Employee Chat system (0072_winsalot_chat.sql) let
-- a notification generated on one CRM link to the *other* CRM's chat path
-- (resolveChatHomePath() picked whichever CRM a recipient happened to be
-- active in, Cleaning-first, regardless of which CRM they were actually
-- using) - and since both winsalot-funding and winsalot-leadgen-crm deploy
-- the exact same codebase with no host-based route restriction, following
-- that link rendered the *other* CRM's page under whichever domain the
-- click happened on. That's what produced
-- leads.winsalotcorp.com/admin displaying the Cleaning CRM.
--
-- The fix: two fully independent chat subsystems, one keyed exclusively to
-- crm_users (Cleaning), one exclusively to leadgen_users (Lead Gen) - built
-- on the SAME already-existing, already-CRM-exclusive crm_user_role()/
-- leadgen_user_role() functions (see 0007_crm_leads.sql, 0031_leadgen_crm.sql)
-- that every other per-CRM table in this app already relies on, so there is
-- no cross-CRM lookup anywhere in either RLS policy set below - not even a
-- read. Notifications reuse the existing crm_notifications/leadgen_notifications
-- tables (already RLS-scoped to user_id = auth.uid(), already wired into
-- each CRM's own NotificationBell) rather than a new shared table.
--
-- The old winsalot_* shared chat tables/functions from 0072 are left in
-- place untouched (not dropped) - the app stops reading/writing them as of
-- this fix, but they're inert and harmless, and this keeps the migration
-- purely additive/reversible. They can be cleaned up in a follow-up once
-- the isolated system is confirmed working.

-- ---------------------------------------------------------------------
-- Cleaning CRM Chat - crm_users only, never leadgen_users
-- ---------------------------------------------------------------------

create table public.crm_company_messages (
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

create index crm_company_messages_created_idx on public.crm_company_messages(created_at desc);
alter table public.crm_company_messages enable row level security;

create policy "crm_company_messages_select_active_members"
  on public.crm_company_messages for select
  using (public.crm_user_role(auth.uid()) in ('admin', 'agent'));

create policy "crm_company_messages_insert_own"
  on public.crm_company_messages for insert
  with check (
    sender_id = auth.uid()
    and public.crm_user_role(auth.uid()) in ('admin', 'agent')
    and deleted_at is null and deleted_by is null and deleted_by_name is null
  );

create policy "crm_company_messages_delete_own_recent_or_admin"
  on public.crm_company_messages for update
  using (
    (sender_id = auth.uid() and created_at > now() - interval '15 minutes')
    or public.crm_user_role(auth.uid()) = 'admin'
  )
  with check (deleted_at is not null and deleted_by = auth.uid());

create trigger crm_company_messages_soft_delete_only
  before update on public.crm_company_messages
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create table public.crm_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  participant_one uuid not null references auth.users(id) on delete cascade,
  participant_two uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  constraint crm_dm_conversations_distinct_participants check (participant_one <> participant_two),
  constraint crm_dm_conversations_ordered_pair check (participant_one < participant_two),
  constraint crm_dm_conversations_unique_pair unique (participant_one, participant_two)
);

alter table public.crm_dm_conversations enable row level security;

create policy "crm_dm_conversations_select_participant"
  on public.crm_dm_conversations for select
  using (auth.uid() in (participant_one, participant_two));

create policy "crm_dm_conversations_insert_participant"
  on public.crm_dm_conversations for insert
  with check (
    auth.uid() in (participant_one, participant_two)
    and public.crm_user_role(participant_one) in ('admin', 'agent')
    and public.crm_user_role(participant_two) in ('admin', 'agent')
  );

create table public.crm_dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_dm_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_name text
);

create index crm_dm_messages_conversation_idx on public.crm_dm_messages(conversation_id, created_at desc);
alter table public.crm_dm_messages enable row level security;

create policy "crm_dm_messages_select_participant"
  on public.crm_dm_messages for select
  using (
    exists (
      select 1 from public.crm_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

create policy "crm_dm_messages_insert_participant"
  on public.crm_dm_messages for insert
  with check (
    sender_id = auth.uid()
    and public.crm_user_role(auth.uid()) in ('admin', 'agent')
    and deleted_at is null and deleted_by is null and deleted_by_name is null
    and exists (
      select 1 from public.crm_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

-- No admin bypass here at all, same as 0072 - only the sender may ever
-- soft-delete their own recent DM.
create policy "crm_dm_messages_delete_own_recent"
  on public.crm_dm_messages for update
  using (
    sender_id = auth.uid() and created_at > now() - interval '15 minutes'
    and exists (
      select 1 from public.crm_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  )
  with check (deleted_at is not null and deleted_by = auth.uid());

create trigger crm_dm_messages_soft_delete_only
  before update on public.crm_dm_messages
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create trigger crm_dm_messages_touch_conversation
  after insert on public.crm_dm_messages
  for each row execute function public.winsalot_dm_touch_conversation();

create table public.crm_dm_read_state (
  conversation_id uuid not null references public.crm_dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.crm_dm_read_state enable row level security;

create policy "crm_dm_read_state_own"
  on public.crm_dm_read_state for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.crm_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

create table public.crm_announcements (
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

create index crm_announcements_pinned_created_idx on public.crm_announcements(pinned desc, created_at desc);
alter table public.crm_announcements enable row level security;

create policy "crm_announcements_select_active_members"
  on public.crm_announcements for select
  using (public.crm_user_role(auth.uid()) in ('admin', 'agent'));

create policy "crm_announcements_insert_admin_only"
  on public.crm_announcements for insert
  with check (
    sender_id = auth.uid()
    and public.crm_user_role(auth.uid()) = 'admin'
    and deleted_at is null and deleted_by is null and deleted_by_name is null
  );

create policy "crm_announcements_update_admin_only"
  on public.crm_announcements for update
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

create trigger crm_announcements_soft_delete_only
  before update on public.crm_announcements
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create table public.crm_announcement_reads (
  announcement_id uuid not null references public.crm_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.crm_announcement_reads enable row level security;

create policy "crm_announcement_reads_own"
  on public.crm_announcement_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.crm_user_role(auth.uid()) in ('admin', 'agent'));

create table public.crm_company_chat_read_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.crm_company_chat_read_state enable row level security;

create policy "crm_company_chat_read_state_own"
  on public.crm_company_chat_read_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.crm_user_role(auth.uid()) in ('admin', 'agent'));

create table public.crm_chat_audit_log (
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

alter table public.crm_chat_audit_log enable row level security;

create policy "crm_chat_audit_log_admin_select"
  on public.crm_chat_audit_log for select
  using (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Lead Generation CRM Chat - leadgen_users only, never crm_users. Client-
-- role leadgen_users (customer portal accounts) are explicitly excluded
-- from every policy below - only 'admin'/'agent' roles get chat access.
-- ---------------------------------------------------------------------

create table public.leadgen_company_messages (
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

create index leadgen_company_messages_created_idx on public.leadgen_company_messages(created_at desc);
alter table public.leadgen_company_messages enable row level security;

create policy "leadgen_company_messages_select_active_members"
  on public.leadgen_company_messages for select
  using (public.leadgen_user_role(auth.uid()) in ('admin', 'agent'));

create policy "leadgen_company_messages_insert_own"
  on public.leadgen_company_messages for insert
  with check (
    sender_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) in ('admin', 'agent')
    and deleted_at is null and deleted_by is null and deleted_by_name is null
  );

create policy "leadgen_company_messages_delete_own_recent_or_admin"
  on public.leadgen_company_messages for update
  using (
    (sender_id = auth.uid() and created_at > now() - interval '15 minutes')
    or public.leadgen_user_role(auth.uid()) = 'admin'
  )
  with check (deleted_at is not null and deleted_by = auth.uid());

create trigger leadgen_company_messages_soft_delete_only
  before update on public.leadgen_company_messages
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create table public.leadgen_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  participant_one uuid not null references auth.users(id) on delete cascade,
  participant_two uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  constraint leadgen_dm_conversations_distinct_participants check (participant_one <> participant_two),
  constraint leadgen_dm_conversations_ordered_pair check (participant_one < participant_two),
  constraint leadgen_dm_conversations_unique_pair unique (participant_one, participant_two)
);

alter table public.leadgen_dm_conversations enable row level security;

create policy "leadgen_dm_conversations_select_participant"
  on public.leadgen_dm_conversations for select
  using (auth.uid() in (participant_one, participant_two));

create policy "leadgen_dm_conversations_insert_participant"
  on public.leadgen_dm_conversations for insert
  with check (
    auth.uid() in (participant_one, participant_two)
    and public.leadgen_user_role(participant_one) in ('admin', 'agent')
    and public.leadgen_user_role(participant_two) in ('admin', 'agent')
  );

create table public.leadgen_dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.leadgen_dm_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_name text
);

create index leadgen_dm_messages_conversation_idx on public.leadgen_dm_messages(conversation_id, created_at desc);
alter table public.leadgen_dm_messages enable row level security;

create policy "leadgen_dm_messages_select_participant"
  on public.leadgen_dm_messages for select
  using (
    exists (
      select 1 from public.leadgen_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

create policy "leadgen_dm_messages_insert_participant"
  on public.leadgen_dm_messages for insert
  with check (
    sender_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) in ('admin', 'agent')
    and deleted_at is null and deleted_by is null and deleted_by_name is null
    and exists (
      select 1 from public.leadgen_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

create policy "leadgen_dm_messages_delete_own_recent"
  on public.leadgen_dm_messages for update
  using (
    sender_id = auth.uid() and created_at > now() - interval '15 minutes'
    and exists (
      select 1 from public.leadgen_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  )
  with check (deleted_at is not null and deleted_by = auth.uid());

create trigger leadgen_dm_messages_soft_delete_only
  before update on public.leadgen_dm_messages
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create trigger leadgen_dm_messages_touch_conversation
  after insert on public.leadgen_dm_messages
  for each row execute function public.winsalot_dm_touch_conversation();

create table public.leadgen_dm_read_state (
  conversation_id uuid not null references public.leadgen_dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.leadgen_dm_read_state enable row level security;

create policy "leadgen_dm_read_state_own"
  on public.leadgen_dm_read_state for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.leadgen_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  );

create table public.leadgen_announcements (
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

create index leadgen_announcements_pinned_created_idx on public.leadgen_announcements(pinned desc, created_at desc);
alter table public.leadgen_announcements enable row level security;

create policy "leadgen_announcements_select_active_members"
  on public.leadgen_announcements for select
  using (public.leadgen_user_role(auth.uid()) in ('admin', 'agent'));

create policy "leadgen_announcements_insert_admin_only"
  on public.leadgen_announcements for insert
  with check (
    sender_id = auth.uid()
    and public.leadgen_user_role(auth.uid()) = 'admin'
    and deleted_at is null and deleted_by is null and deleted_by_name is null
  );

create policy "leadgen_announcements_update_admin_only"
  on public.leadgen_announcements for update
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create trigger leadgen_announcements_soft_delete_only
  before update on public.leadgen_announcements
  for each row execute function public.winsalot_chat_enforce_soft_delete_only();

create table public.leadgen_announcement_reads (
  announcement_id uuid not null references public.leadgen_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.leadgen_announcement_reads enable row level security;

create policy "leadgen_announcement_reads_own"
  on public.leadgen_announcement_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.leadgen_user_role(auth.uid()) in ('admin', 'agent'));

create table public.leadgen_company_chat_read_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.leadgen_company_chat_read_state enable row level security;

create policy "leadgen_company_chat_read_state_own"
  on public.leadgen_company_chat_read_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.leadgen_user_role(auth.uid()) in ('admin', 'agent'));

create table public.leadgen_chat_audit_log (
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

alter table public.leadgen_chat_audit_log enable row level security;

create policy "leadgen_chat_audit_log_admin_select"
  on public.leadgen_chat_audit_log for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- Realtime: RLS-filtered postgres_changes for live message delivery, per
-- CRM's own tables only.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.crm_company_messages;
alter publication supabase_realtime add table public.crm_dm_messages;
alter publication supabase_realtime add table public.crm_announcements;
alter publication supabase_realtime add table public.leadgen_company_messages;
alter publication supabase_realtime add table public.leadgen_dm_messages;
alter publication supabase_realtime add table public.leadgen_announcements;
