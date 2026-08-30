-- Client Portal Access: lets the Winsalot Growth CRM (crm_clients) act as
-- the control center for creating/activating/disabling a Lead Generation
-- CRM client login (leadgen_users, role='client'), without merging the two
-- otherwise-independent CRMs' schemas or duplicating lead/appointment data.
--
-- Entirely additive, backward compatible:
--   - crm_clients gains one new nullable, unique FK column
--     (leadgen_client_id) linking a Growth CRM client record to the Lead
--     Gen CRM client/campaign it corresponds to. Optional - existing rows
--     are unaffected until an admin explicitly links one.
--   - leadgen_users gains nullable audit columns (invited/activated/
--     deactivated/last_login) so "Client Portal Access" status and history
--     can be shown without a second parallel status table drifting out of
--     sync with the real active flag that already gates login
--     (requireLeadgenUser in src/lib/leadgen-auth.ts).
--   - crm_client_portal_activity is a brand-new, Growth-CRM-side,
--     admin-only audit log of portal actions (created/activated/disabled/
--     reactivated/invite sent/access reset) - kept separate from
--     crm_activities (whose activity_type is a shared, already-large
--     check-constraint list) so this feature never has to touch that
--     constraint or that feed's rendering.
--   - leadgen_lead_client_feedback is a brand-new table letting a client
--     login record feedback on their own leads (Good Lead/Follow Up/Not
--     Qualified/Appointment Completed/Converted-Won/Not Interested),
--     scoped by the same leadgen_user_client_id() RLS helper every other
--     client-facing leadgen table already uses. Insert-only for a client
--     (no update/delete policy) - feedback is a preserved history, not an
--     editable field, and a client can never delete a lead or its
--     feedback.
--   - leadgen_leads gains one new nullable text column, client_notes -
--     distinct from the existing internal `notes` column (agent/admin-only,
--     never shown to a client login) - so admins/agents can optionally
--     write a note a client IS meant to see on their lead detail page.
--
-- Nothing here renames or drops any existing table/column, and no existing
-- RLS policy is altered - every new policy is additive.

-- ---------------------------------------------------------------------
-- crm_clients <-> leadgen_clients link
-- ---------------------------------------------------------------------
alter table public.crm_clients
  add column if not exists leadgen_client_id uuid references public.leadgen_clients(id) on delete set null;

create unique index if not exists crm_clients_leadgen_client_unique_idx
  on public.crm_clients(leadgen_client_id)
  where leadgen_client_id is not null;

-- ---------------------------------------------------------------------
-- leadgen_users: portal access audit trail. by/on delete set null
-- reference auth.users directly (not crm_users or leadgen_users) since the
-- admin performing these actions may be a Growth CRM admin with no
-- leadgen_users row of their own at all.
-- ---------------------------------------------------------------------
alter table public.leadgen_users
  add column if not exists invited_at timestamptz,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references auth.users(id) on delete set null,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users(id) on delete set null,
  add column if not exists last_login_at timestamptz;

-- ---------------------------------------------------------------------
-- crm_client_portal_activity: Growth CRM-side, admin-only history of
-- portal actions for a given crm_clients row (brief: "Keep an activity
-- history for Admin"). Read/written exclusively through the Supabase
-- service-role client from Growth CRM Server Actions (a Growth CRM admin
-- session has no leadgen_user_role() of its own to satisfy a leadgen-style
-- policy), so RLS here only needs to protect against a *Growth CRM*
-- session, not a leadgen one.
-- ---------------------------------------------------------------------
create table if not exists public.crm_client_portal_activity (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  action text not null check (action in (
    'leadgen_client_linked',
    'portal_created',
    'portal_activated',
    'portal_disabled',
    'portal_reactivated',
    'invite_sent',
    'invite_resent',
    'access_reset'
  )),
  performed_by uuid references public.crm_users(id) on delete set null,
  performed_by_name text,
  detail text
);

create index if not exists crm_client_portal_activity_client_idx
  on public.crm_client_portal_activity(client_id, created_at desc);

alter table public.crm_client_portal_activity enable row level security;

create policy "crm_client_portal_activity_admin_all"
  on public.crm_client_portal_activity for all
  using (public.crm_user_role(auth.uid()) = 'admin')
  with check (public.crm_user_role(auth.uid()) = 'admin');

-- ---------------------------------------------------------------------
-- leadgen_leads.client_notes: optional, admin/agent-written, client-safe
-- note - distinct from the existing internal `notes` column, which stays
-- agent/admin-only exactly as it is today (never exposed by any client
-- policy, same as leadgen_lead_activities).
-- ---------------------------------------------------------------------
alter table public.leadgen_leads
  add column if not exists client_notes text;

-- ---------------------------------------------------------------------
-- leadgen_lead_client_feedback: a client login's own feedback on one of
-- their leads (brief "CLIENT FEEDBACK"). Preserved history, never
-- editable/deletable by the client that submitted it.
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_lead_client_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leadgen_leads(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  submitted_by_name text not null,
  feedback text not null check (feedback in (
    'Good Lead', 'Follow Up', 'Not Qualified', 'Appointment Completed', 'Converted / Won', 'Not Interested'
  )),
  note text
);

create index if not exists leadgen_lead_client_feedback_lead_idx
  on public.leadgen_lead_client_feedback(lead_id, created_at desc);
create index if not exists leadgen_lead_client_feedback_client_idx
  on public.leadgen_lead_client_feedback(client_id);

alter table public.leadgen_lead_client_feedback enable row level security;

create policy "leadgen_lead_client_feedback_admin_all"
  on public.leadgen_lead_client_feedback for all
  using (public.leadgen_user_role(auth.uid()) = 'admin')
  with check (public.leadgen_user_role(auth.uid()) = 'admin');

create policy "leadgen_lead_client_feedback_agent_select_own_lead"
  on public.leadgen_lead_client_feedback for select
  using (
    public.leadgen_user_role(auth.uid()) = 'agent'
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.assigned_agent_id = auth.uid())
  );

create policy "leadgen_lead_client_feedback_client_select_own"
  on public.leadgen_lead_client_feedback for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

-- Insert-only for a client login, and only for a lead that genuinely
-- belongs to their own client_id - guards against a forged client_id in
-- the insert payload that doesn't match the lead's real owner.
create policy "leadgen_lead_client_feedback_client_insert_own"
  on public.leadgen_lead_client_feedback for insert
  with check (
    submitted_by = auth.uid()
    and client_id = public.leadgen_user_client_id(auth.uid())
    and exists (select 1 from public.leadgen_leads l where l.id = lead_id and l.client_id = public.leadgen_user_client_id(auth.uid()))
  );
