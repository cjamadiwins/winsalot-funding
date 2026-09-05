-- Client Portal Call Activity: lets a Lead Generation CRM client see the
-- calls logged against their own account, without ever exposing the
-- existing internal `notes` column (agent-facing call detail, never
-- meant for a client login) - same "internal notes column stays private,
-- clients get their own separate field" pattern already used for
-- leadgen_leads.client_notes (migration 0114).
--
-- Purely additive: no existing column, row, or policy is changed. The
-- existing admin/agent call-log system (leadgen_call_logs_admin_all,
-- leadgen_call_logs_agent_select_own/insert_own from migration 0130) is
-- untouched - admins can already write this new column under the
-- existing "for all" admin policy, so no new write policy is needed.
alter table public.leadgen_call_logs
  add column if not exists client_visible_note text;

-- New read-only policy so a client login (role='client') can see their
-- own calls - mirrors leadgen_leads_client_select_own/leadgen_appointments_
-- client_select_own (migration 0031), using the same leadgen_user_client_id()
-- security-definer helper. Column-level hiding of `notes`/`agent_id` is
-- enforced by the application's explicit select list, not by RLS (Postgres
-- RLS is row-level only) - see src/app/client/(portal)/call-activity/page.tsx.
create policy "leadgen_call_logs_client_select_own"
  on public.leadgen_call_logs for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));
