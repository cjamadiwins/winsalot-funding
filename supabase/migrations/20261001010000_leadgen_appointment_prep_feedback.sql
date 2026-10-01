-- Lead Generation CRM: Client Appointment Preparation + Post-Appointment
-- Client Feedback.
--
-- Additive only. No existing table, column, row, policy, grant or function
-- is changed, and no existing appointment is touched: every table below
-- references the existing leadgen_appointments / leadgen_clients rows by
-- id and nothing is duplicated. Appointment status (Booked/Confirmed/
-- Completed/...) stays on leadgen_appointments; the preparation status and
-- feedback live on their own rows.
--
-- Table split (client isolation by construction, not by column hiding):
--   * leadgen_appointment_briefs     - CLIENT-VISIBLE brief + prep status.
--   * leadgen_appointment_feedback   - client-submitted outcome/rating.
--   * leadgen_appointment_admin_notes- INTERNAL notes (prep + feedback).
--                                      Admin only; no client policy exists.
--   * leadgen_portal_preview_audit   - audit trail of Admin "Preview as
--                                      Client" opens. Admin only.
--
-- Access model (explicit grants only, no broad permissions):
--   * authenticated: SELECT only, and only through RLS below.
--   * Every write goes through a server action using service_role, after
--     that action has verified the caller (Admin for briefs/notes/audit; the
--     signed-in client's own appointment for feedback and the Viewed stamp).
--   * anon: no access at all.

-- ---------------------------------------------------------------------
-- Client-visible appointment brief (one per appointment)
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_appointment_briefs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.leadgen_appointments(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  why_interested text,
  primary_opportunity text,
  interest_level text check (interest_level is null or interest_level in ('High', 'Medium', 'Early Interest')),
  recommended_objective text,
  -- Appointment-specific, client-facing summary written by Admin. Never
  -- edits or replaces the original SDR call history (leadgen_lead_activities).
  appointment_summary text,
  talking_points text[] not null default '{}',
  suggested_questions text[] not null default '{}',
  recommended_next_step text,
  next_step_note text,
  prep_status text not null default 'brief_not_prepared'
    check (prep_status in ('brief_not_prepared', 'brief_ready', 'sent_to_client', 'client_viewed')),
  prepared_by uuid references public.leadgen_users(id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references public.leadgen_users(id) on delete set null,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leadgen_appointment_briefs_one_per_appointment unique (appointment_id)
);

create index if not exists leadgen_appointment_briefs_client_idx
  on public.leadgen_appointment_briefs(client_id, prep_status);

alter table public.leadgen_appointment_briefs enable row level security;

drop policy if exists "leadgen_appointment_briefs_admin_select" on public.leadgen_appointment_briefs;
create policy "leadgen_appointment_briefs_admin_select"
  on public.leadgen_appointment_briefs for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

-- A client only ever sees their OWN client's briefs, and only once the
-- Admin has sent them - an unsent draft is never visible to the portal.
drop policy if exists "leadgen_appointment_briefs_client_select_own_sent" on public.leadgen_appointment_briefs;
create policy "leadgen_appointment_briefs_client_select_own_sent"
  on public.leadgen_appointment_briefs for select
  using (
    client_id = public.leadgen_user_client_id(auth.uid())
    and prep_status in ('sent_to_client', 'client_viewed')
  );

revoke all on table public.leadgen_appointment_briefs from anon, authenticated;
grant select on table public.leadgen_appointment_briefs to authenticated;
grant all on table public.leadgen_appointment_briefs to service_role;

comment on table public.leadgen_appointment_briefs is
  'Client-visible Appointment Brief + separate preparation status for a booked appointment. Written only via service_role server actions (Admin) and the Viewed stamp (the owning client''s own session verified first). Internal notes live in leadgen_appointment_admin_notes, never here.';

-- ---------------------------------------------------------------------
-- Client-submitted post-appointment feedback (one per appointment)
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_appointment_feedback (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.leadgen_appointments(id) on delete cascade,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  outcome text not null check (outcome in (
    'Great Opportunity', 'Follow-Up Required', 'Proposal / Quote Sent', 'Second Meeting Booked',
    'Won / Became Customer', 'Not Ready Yet', 'Not Qualified', 'No Show', 'Rescheduled', 'Other'
  )),
  what_happened text,
  opportunity_quality text check (opportunity_quality is null or opportunity_quality in ('Strong', 'Good', 'Fair', 'Poor')),
  fit_issues text[] not null default '{}',
  future_notes text,
  submitted_by uuid references public.leadgen_users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leadgen_appointment_feedback_one_per_appointment unique (appointment_id)
);

create index if not exists leadgen_appointment_feedback_client_idx
  on public.leadgen_appointment_feedback(client_id, submitted_at desc);

alter table public.leadgen_appointment_feedback enable row level security;

drop policy if exists "leadgen_appointment_feedback_admin_select" on public.leadgen_appointment_feedback;
create policy "leadgen_appointment_feedback_admin_select"
  on public.leadgen_appointment_feedback for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

drop policy if exists "leadgen_appointment_feedback_client_select_own" on public.leadgen_appointment_feedback;
create policy "leadgen_appointment_feedback_client_select_own"
  on public.leadgen_appointment_feedback for select
  using (client_id = public.leadgen_user_client_id(auth.uid()));

revoke all on table public.leadgen_appointment_feedback from anon, authenticated;
grant select on table public.leadgen_appointment_feedback to authenticated;
grant all on table public.leadgen_appointment_feedback to service_role;

comment on table public.leadgen_appointment_feedback is
  'Client feedback on a completed appointment (outcome, opportunity quality, fit issues, notes for future appointments). Informational only - never changes campaign criteria, call lists, assignments or scripts. Written only via a service_role server action that verifies the signed-in client owns the appointment.';

-- ---------------------------------------------------------------------
-- Internal Admin notes (never client-visible)
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_appointment_admin_notes (
  appointment_id uuid primary key references public.leadgen_appointments(id) on delete cascade,
  prep_note text,
  feedback_note text,
  updated_by uuid references public.leadgen_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.leadgen_appointment_admin_notes enable row level security;

drop policy if exists "leadgen_appointment_admin_notes_admin_select" on public.leadgen_appointment_admin_notes;
create policy "leadgen_appointment_admin_notes_admin_select"
  on public.leadgen_appointment_admin_notes for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

revoke all on table public.leadgen_appointment_admin_notes from anon, authenticated;
grant select on table public.leadgen_appointment_admin_notes to authenticated;
grant all on table public.leadgen_appointment_admin_notes to service_role;

comment on table public.leadgen_appointment_admin_notes is
  'Internal Winsalot Admin notes for an appointment brief/feedback. Admin-readable only; no client or agent policy exists.';

-- ---------------------------------------------------------------------
-- Admin "Preview as Client" audit trail
-- ---------------------------------------------------------------------
create table if not exists public.leadgen_portal_preview_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.leadgen_users(id) on delete set null,
  client_id uuid not null references public.leadgen_clients(id) on delete cascade,
  appointment_id uuid references public.leadgen_appointments(id) on delete set null,
  action text not null default 'preview_portal',
  created_at timestamptz not null default now()
);

create index if not exists leadgen_portal_preview_audit_client_idx
  on public.leadgen_portal_preview_audit(client_id, created_at desc);

alter table public.leadgen_portal_preview_audit enable row level security;

drop policy if exists "leadgen_portal_preview_audit_admin_select" on public.leadgen_portal_preview_audit;
create policy "leadgen_portal_preview_audit_admin_select"
  on public.leadgen_portal_preview_audit for select
  using (public.leadgen_user_role(auth.uid()) = 'admin');

revoke all on table public.leadgen_portal_preview_audit from anon, authenticated;
grant select on table public.leadgen_portal_preview_audit to authenticated;
grant all on table public.leadgen_portal_preview_audit to service_role;

comment on table public.leadgen_portal_preview_audit is
  'Audit log of Admin read-only client portal previews. Admins never authenticate with client credentials; previews run under the Admin session and are recorded here.';
