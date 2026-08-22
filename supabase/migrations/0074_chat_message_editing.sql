-- Lets a sender edit their own Company Chat / Direct Message content after
-- posting (never someone else's), stamping edited_at automatically so a
-- client can never forge that timestamp. Deliberately scoped to the 4
-- message tables only - crm_announcements/leadgen_announcements keep
-- their existing soft-delete/pin-only trigger and admin-only update
-- policy untouched, since editing an announcement wasn't requested and
-- broadening that trigger would have let an admin rewrite another
-- admin's announcement content via the existing permissive
-- crm_announcements_update_admin_only policy.

alter table public.crm_company_messages add column edited_at timestamptz;
alter table public.crm_dm_messages add column edited_at timestamptz;
alter table public.leadgen_company_messages add column edited_at timestamptz;
alter table public.leadgen_dm_messages add column edited_at timestamptz;

-- Generic (identity-agnostic) trigger reused by all 4 message tables in
-- both CRMs, same convention as winsalot_chat_enforce_soft_delete_only():
-- only content/edited_at (an edit) or deleted_at/deleted_by/deleted_by_name
-- (a soft delete) may ever change after a message is posted - sender_id,
-- sender_name, created_at, conversation_id are immutable for the row's
-- lifetime regardless of which RLS policy let the UPDATE through.
create or replace function public.winsalot_chat_enforce_edit_or_soft_delete_only()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (to_jsonb(new) - 'content' - 'edited_at' - 'deleted_at' - 'deleted_by' - 'deleted_by_name')
     is distinct from
     (to_jsonb(old) - 'content' - 'edited_at' - 'deleted_at' - 'deleted_by' - 'deleted_by_name')
  then
    raise exception 'Only editing your own message content, or deleting it, may change it after it is posted.';
  end if;

  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Cleaning CRM
-- ---------------------------------------------------------------------

drop trigger crm_company_messages_soft_delete_only on public.crm_company_messages;
create trigger crm_company_messages_edit_or_soft_delete_only
  before update on public.crm_company_messages
  for each row execute function public.winsalot_chat_enforce_edit_or_soft_delete_only();

drop policy "crm_company_messages_delete_own_recent_or_admin" on public.crm_company_messages;
-- USING gates which existing rows a caller may touch at all: their own
-- not-yet-deleted message (to edit or delete), or any message if they're
-- an admin (moderation, delete only - see WITH CHECK). Once a message is
-- deleted, the sender branch no longer matches, so a sender can never
-- "undelete" or further edit it afterward.
create policy "crm_company_messages_update"
  on public.crm_company_messages for update
  using (
    (sender_id = auth.uid() and deleted_at is null)
    or public.crm_user_role(auth.uid()) = 'admin'
  )
  with check (
    (deleted_at is not null and deleted_by = auth.uid() and (
      (sender_id = auth.uid() and created_at > now() - interval '15 minutes')
      or public.crm_user_role(auth.uid()) = 'admin'
    ))
    or
    (sender_id = auth.uid() and deleted_at is null)
  );

drop trigger crm_dm_messages_soft_delete_only on public.crm_dm_messages;
create trigger crm_dm_messages_edit_or_soft_delete_only
  before update on public.crm_dm_messages
  for each row execute function public.winsalot_chat_enforce_edit_or_soft_delete_only();

drop policy "crm_dm_messages_delete_own_recent" on public.crm_dm_messages;
-- No admin branch anywhere here, same as before - DM privacy means an
-- admin can never edit, delete, or otherwise touch a DM they didn't send.
create policy "crm_dm_messages_update"
  on public.crm_dm_messages for update
  using (
    sender_id = auth.uid() and deleted_at is null
    and exists (
      select 1 from public.crm_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  )
  with check (
    (deleted_at is not null and deleted_by = auth.uid() and created_at > now() - interval '15 minutes')
    or
    (sender_id = auth.uid() and deleted_at is null)
  );

-- ---------------------------------------------------------------------
-- Lead Generation CRM
-- ---------------------------------------------------------------------

drop trigger leadgen_company_messages_soft_delete_only on public.leadgen_company_messages;
create trigger leadgen_company_messages_edit_or_soft_delete_only
  before update on public.leadgen_company_messages
  for each row execute function public.winsalot_chat_enforce_edit_or_soft_delete_only();

drop policy "leadgen_company_messages_delete_own_recent_or_admin" on public.leadgen_company_messages;
create policy "leadgen_company_messages_update"
  on public.leadgen_company_messages for update
  using (
    (sender_id = auth.uid() and deleted_at is null)
    or public.leadgen_user_role(auth.uid()) = 'admin'
  )
  with check (
    (deleted_at is not null and deleted_by = auth.uid() and (
      (sender_id = auth.uid() and created_at > now() - interval '15 minutes')
      or public.leadgen_user_role(auth.uid()) = 'admin'
    ))
    or
    (sender_id = auth.uid() and deleted_at is null)
  );

drop trigger leadgen_dm_messages_soft_delete_only on public.leadgen_dm_messages;
create trigger leadgen_dm_messages_edit_or_soft_delete_only
  before update on public.leadgen_dm_messages
  for each row execute function public.winsalot_chat_enforce_edit_or_soft_delete_only();

drop policy "leadgen_dm_messages_delete_own_recent" on public.leadgen_dm_messages;
create policy "leadgen_dm_messages_update"
  on public.leadgen_dm_messages for update
  using (
    sender_id = auth.uid() and deleted_at is null
    and exists (
      select 1 from public.leadgen_dm_conversations c
      where c.id = conversation_id and auth.uid() in (c.participant_one, c.participant_two)
    )
  )
  with check (
    (deleted_at is not null and deleted_by = auth.uid() and created_at > now() - interval '15 minutes')
    or
    (sender_id = auth.uid() and deleted_at is null)
  );
