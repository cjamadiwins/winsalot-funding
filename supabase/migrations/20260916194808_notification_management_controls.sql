-- Notification cleanup controls for both Winsalot CRMs. A delete removes
-- only the signed-in recipient's notification row; linked business records
-- live in separate tables and are not modified or deleted.
create policy "crm_notifications_delete_own"
  on public.crm_notifications for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "leadgen_notifications_delete_own"
  on public.leadgen_notifications for delete
  to authenticated
  using ((select auth.uid()) = user_id);
