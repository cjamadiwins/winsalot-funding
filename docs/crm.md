# Calling Agent CRM

A CRM for calling agents to enter interested commercial-cleaning leads, follow up after a
quote has been sent, and track the pipeline through to a closed opportunity. It's layered on
top of the existing quote system (`/commercial-cleaning-quote`, `/admin`) — it links to quote
requests rather than duplicating them, and reuses the same Supabase project, Supabase Auth,
and Vercel deployment.

## How it works

1. An agent signs in at **`/agent/login`** and adds a new interested lead from
   **`/agent/dashboard`** with the customer's cleaning details.
2. The agent works the lead through its stages (`New interested lead` → `Waiting for cleaning
   details` → `Quote requested from provider` → ... → `Closed/completed`), logging calls,
   emails, texts, voicemails, and notes on the lead's activity timeline, and scheduling a next
   follow-up date/time as they go.
3. An admin connects the lead to an existing quote request from **`/admin/crm/leads/[id]`**
   (search by name, phone, or email) once one exists. That page embeds the same review/approve/
   send workflow as the standalone quote dashboard, so the admin can review the provider's
   price, approve the customer-facing quote, and click **Send Quote to Customer** — an
   admin-only action agents never have access to — without leaving the CRM.
4. The customer accepts or declines through the *existing* `/customer-quote/[token]` flow,
   unchanged. That response automatically updates the linked lead's stage to `Customer
   accepted` or `Customer declined` — agents never enter this manually, and the assigned agent
   follows up from there.
5. Once the admin is done, they click **Final Approval — Close Opportunity** on the lead page,
   which marks it `Closed/completed` and logs it in the activity history.

## Follow-Up Calendar

Scheduled callbacks are a dedicated table, **`crm_followups`** (migration
`0011_crm_followups.sql`) — separate from the `crm_activities` timeline, since a real calendar
needs multiple independent, reschedulable, completable entries per lead, which a single
`crm_leads.next_follow_up_at` scalar can't represent on its own.

- **Scheduling**: an agent picks a date/time and adds a short note, either from the **+
  Schedule Callback** control on their own dashboard (with a lead picker) or from the
  **Scheduled Callbacks** section on a lead's own page. Logging an activity with a follow-up
  date (the pre-existing mechanism) also creates a `crm_followups` entry now, so every
  follow-up — however it was scheduled — shows up in one place.
- **`/agent/dashboard`** shows three grouped lists — **Overdue**, **Today**, **Upcoming** — of
  the signed-in agent's own pending callbacks, each with **Mark Completed**, **Reschedule**
  (inline date/time + note editor), and **Add Note** (logs a `crm_activities` note against the
  lead, reusing the existing timeline rather than a second notes field).
- **`crm_leads.next_follow_up_at`** is now a *derived* column: a database trigger
  (`crm_followups_sync_lead_next_follow_up`) recomputes it as the earliest pending callback for
  that lead on every insert/update/delete to `crm_followups`, so it stays correct automatically
  and every existing place that already read it (dashboards, lead pages, `isOverdue`/`isDueToday`)
  keeps working unchanged. Application code no longer writes to it directly.
- **Access control**: exactly like `crm_activities`, a callback's visibility is scoped through
  its lead's *current* `assigned_agent_id`, not a stored owner on the callback itself — so
  reassigning a lead transfers its pending callbacks immediately, and the previous agent loses
  access just as immediately. Verified directly against the live database: an agent can see and
  complete/reschedule a callback on their own lead, but a callback on a lead assigned to someone
  else is invisible to them and an attempted update silently affects zero rows.
- **Admin** sees every agent's callbacks (grouped the same way, filterable by agent) on
  **`/admin/crm`**. This view is read-only by design — day-to-day callback management belongs to
  the assigned agent; admin's job here is oversight.

## Sales Training & Call Scripts

A read-only reference section for agents, reachable at **`/agent/training`** — deliberately its
own top-level nav item, separate from `/agent/dashboard`, so training content never competes for
space with the lead-management screen. Agents can view and copy any script or training material
there (a **Copy** button on each entry copies its full text to the clipboard) but cannot add,
edit, or remove anything themselves.

Only admins can manage the content, from **`/admin/crm/training`**.

- **`crm_training_materials`** (migration
  [`0018_crm_training_materials.sql`](../supabase/migrations/0018_crm_training_materials.sql)) —
  `title`, `content`, `sort_order`, `created_by` (→ `crm_users`), `updated_at` (kept current by a
  trigger, same pattern as `active_cleaning_opportunities`).
- **RLS**: any active CRM member (agent or admin) can `select` every row
  (`crm_training_materials_select_members`); only `role = 'admin'` can `insert`/`update`/`delete`
  (`crm_training_materials_admin_all`) — enforced at the database level, not just by hiding the
  admin-only UI from agents.
- The migration seeds one initial entry, the **General Commercial Cleaning Call Script**, so the
  section isn't empty on first deploy. Migration
  [`0019_rename_commercial_cleaning_script.sql`](../supabase/migrations/0019_rename_commercial_cleaning_script.sql)
  renamed it from its original "Property Management Cleaning Call Script" title and generalized
  its industry-specific sentence so it reads as suitable for agents calling businesses in any
  industry, not just property management.
- Migration
  [`0021_followup_call_script.sql`](../supabase/migrations/0021_followup_call_script.sql) adds a
  second entry, the **Cleaning Quote Request Follow-Up Script**, for agents calling a client who
  was already sent a quote-request link but hasn't completed it — covers the live-answer flow
  (confirming receipt, offering to resend, handling questions) and a separate voicemail version.

## User roles

- **Admin** — every account that already exists today (see "Roles and the existing /admin
  dashboard" below). Full access to every lead, agent management, reassignment, deletion, and
  the quote-request link. Reachable at `/admin/crm`, `/admin/crm/leads/[id]`,
  `/admin/crm/agents`, and `/admin/crm/training`.
- **Agent** — a new account type, created from `/admin/crm/agents`. Can only see and edit
  leads assigned to them, cannot delete a lead, cannot reassign a lead to someone else, and
  never sees `/admin/*`. Reachable at `/agent/login`, `/agent/dashboard`, `/agent/leads/new`,
  `/agent/leads/[id]`, and `/agent/training` (view/copy only).

## Roles and the existing /admin dashboard

Before this change, `requireAdminUser()` treated *any* logged-in Supabase Auth user as a full
admin of the quote dashboard — there was no role concept. Adding agent accounts to the same
Supabase Auth pool meant an agent could otherwise sign in and browse the entire quote
dashboard, which isn't what "agents cannot access sensitive system settings" means.

To fix that without changing anything for existing admins:

- Migration `0007_crm_leads.sql` seeds a `crm_users` row with `role = 'admin'` for every
  Supabase Auth user that already exists, so nobody loses access.
- `requireAdminUser()` (`src/lib/admin-auth.ts`) now also checks `crm_users.role`: an account
  explicitly marked `role = 'agent'` is redirected back to `/admin/login`; everyone else
  (`role = 'admin'`, or no `crm_users` row at all) keeps today's behavior unchanged.
- `src/proxy.ts` gains a second gated section (`/agent/:path*`, mirroring the existing
  `/admin/:path*` handling) that redirects signed-out visitors to `/agent/login` instead of
  `/admin/login`. The `/admin/*` gating logic itself is unchanged — same checks, same
  redirects, just refactored into a shared function.

## Email delivery tracking

Every quote-request and follow-up email an agent or admin sends from a lead's page
(`/admin/crm/leads/[id]` or `/agent/leads/[id]`) is tracked end-to-end via Resend's webhooks, not
just fire-and-forget:

- **Sending** — `sendTrackedCrmEmail` (`src/lib/send-crm-email.ts`), shared by
  `sendQuoteRequestEmailForLead` and `sendFollowUpEmailForLead`, records the Resend email id
  returned by `resend.emails.send()` in a new **`crm_lead_emails`** row (migration
  [`0022_crm_email_delivery_tracking.sql`](../supabase/migrations/0022_crm_email_delivery_tracking.sql)),
  alongside which lead/agent/activity it belongs to, its type (`quote_request` | `follow_up`),
  and an initial `status = 'sent'`. It also logs the existing `crm_activities` "Quote request
  email sent to…" / "Follow-up email sent to…" entry exactly as before.
- **Receiving events** — `POST /api/webhooks/resend` (`src/app/api/webhooks/resend/route.ts`)
  verifies the incoming request's signature with Resend's own bundled verifier
  (`resend.webhooks.verify()`, keyed by `RESEND_WEBHOOK_SECRET`) and handles all eight delivery
  events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`,
  `email.complained`, `email.opened`, `email.clicked`, `email.failed`. Each event:
  1. Is recorded once in `crm_email_webhook_events` (a Standard-Webhooks id dedupe table) so a
     retried delivery never double-logs.
  2. Updates the matching `crm_lead_emails` row's per-event timestamp column
     (`sent_at`/`delivered_at`/.../`failed_at`) and, only if the event isn't older than what's
     already recorded, its `status`/`status_at`.
  3. Mirrors that status onto `crm_leads.last_email_status` / `last_email_status_at` — but only
     when this is the lead's most recently sent tracked email, so a late webhook for an older
     email can never overwrite what a newer email already reported.
  4. Logs a new `crm_activities` entry (system-generated, `agent_id` null) with the event's own
     timestamp, so the activity timeline shows exactly when each delivery event happened — not
     just when the agent clicked send.
  - A Resend email with no matching `crm_lead_emails` row (the opportunity alert, agent invite,
    or backup notification emails) is silently ignored — this endpoint only ever updates
    per-lead tracked sends.
  - **`email.delivered` never implies `email.opened`** — each status is only ever set by its own
    matching event; a delivered email is never shown as read.
  - Every branch logs to console (`[resend-webhook] ...`), visible in Vercel's Logs tab or via
    the Vercel MCP `get_runtime_logs`/`get_runtime_errors` tools — the fastest way to confirm
    whether Resend is calling this endpoint at all versus a match/processing problem inside it
    (see Troubleshooting below).
- **Display** — `EmailStatusPanel` (`src/components/EmailStatusPanel.tsx`) renders prominently at
  the top of both `/admin/crm/leads/[id]` and `/agent/leads/[id]`, right under the page header:
  four labeled milestones (**Sent**, **Delivered**, **Bounced**, **Failed**) each with their own
  timestamp if that event happened for the lead's most recently sent tracked email, plus a
  "Latest status change" line covering the full lifecycle (also Delayed/Complaint/Opened/Link
  clicked, whichever happened most recently). It's fed by a service-role read of that lead's
  newest `crm_lead_emails` row (same access pattern as the linked-quote lookup on the same page —
  only reached once RLS has already confirmed the caller can see the lead). The same
  `last_email_status` also still shows as a compact badge in the `/admin/crm` table and
  `/agent/dashboard` lead cards. A bounced or failed email highlights the panel with a banner
  telling the agent to verify/correct the address (bounced) or check the reason before retrying
  (failed); a complaint tells them to consider not emailing that lead again.

### Setting up the Resend webhook

1. In the [Resend dashboard](https://resend.com/webhooks), click **Add Webhook**.
2. **Endpoint URL**: `https://<your-deployment-domain>/api/webhooks/resend` — for production,
   `https://cleaning.winsalotcorp.com/api/webhooks/resend`; for a Preview deployment, use that
   branch's stable Vercel alias (e.g. `https://<project>-git-<branch>-<team>.vercel.app/api/webhooks/resend`,
   shown on the PR's Vercel comment/preview URL) rather than a one-off deployment URL, since the
   alias keeps pointing at the latest deployment on that branch as you push more commits.
   Preview and Production currently share the same Supabase project, so either endpoint updates
   the same `crm_lead_emails`/`crm_leads` rows — point the webhook at whichever deployment you
   want events attributed to, and remember to add a second webhook (or update this one) once you
   promote to production.
3. **Events to send**: `email.sent`, `email.delivered`, `email.delivery_delayed`,
   `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.failed`.
4. Save, then copy the endpoint's **Signing Secret** and set it as `RESEND_WEBHOOK_SECRET` in
   Vercel (Project Settings → Environment Variables) for the environment(s) that should verify
   it. Without this set, `/api/webhooks/resend` rejects every request with a 500 rather than
   processing an unverified payload.
5. Send a test quote-request/follow-up email from a lead and confirm its status updates on the
   lead page as Resend delivers/opens/clicks it (Resend's webhook dashboard also shows recent
   deliveries and response codes for debugging).

### Troubleshooting: status isn't updating

Work through these in order — each one rules out a specific layer:

1. **Was the webhook ever configured?** Resend → Webhooks → your endpoint → recent deliveries.
   If it shows nothing at all for the email you just sent, the endpoint was never registered (or
   was registered against a different/stale deployment URL) — fix it in the Resend dashboard,
   not in this app's code.
2. **Did the request reach this endpoint?** Check Vercel → your project → Logs (or
   `get_runtime_logs`/`get_runtime_errors` for the project) for `[resend-webhook]` lines. No
   lines at all for a period where you sent a test email means Resend isn't calling this
   deployment — re-check step 1's endpoint URL, and confirm you're looking at logs for the same
   deployment/branch the webhook points at.
3. **Was the signature rejected?** A `[resend-webhook] Signature verification failed` or
   `RESEND_WEBHOOK_SECRET is not configured` log line means the endpoint received the request but
   couldn't verify it — re-copy the Signing Secret from the Resend dashboard into
   `RESEND_WEBHOOK_SECRET` on Vercel (it's per-endpoint; regenerating or recreating the webhook
   gives you a new one) and redeploy.
4. **Was the email matched?** A `no crm_lead_emails row matches Resend email id …` log line means
   the webhook verified fine but the email it's reporting on wasn't one sent through "Send Quote
   Request Email"/"Send Follow-Up Email" (e.g. a manually-sent test from the Resend dashboard
   itself, which has no corresponding CRM lead). Send the test from an actual lead's page instead.
5. If none of the above show a problem, query `crm_lead_emails`/`crm_activities` for the lead
   directly to see exactly which events landed and when.

## Quote email control

Customer-facing quote emails are sent only by an admin, only from `/admin/crm/leads/[id]`
(embedded) or `/admin/requests/[id]` (standalone) — both require `requireCrmAdmin()` /
`requireAdminUser()`, and agents have no code path that can reach `sendQuoteToCustomerAction`
at all. An agent's own lead page (`/agent/leads/[id]`) only ever shows a read-only summary of
the linked quote — there's no send control there to remove.

The email itself now always identifies as Winsalot Corp:

- **From**: `Winsalot Corp <info@winsalotcorp.com>` by default (override with
  `CUSTOMER_QUOTE_EMAIL_FROM`, falling back to the general `EMAIL_FROM` if that's the only one
  set). It does **not** default to `quotes@winsalotcorp.com` or any other alias — that address
  isn't configured, and switching to it is an explicit opt-in for later.
- **Reply-To**: `info@winsalotcorp.com` by default (override with `EMAIL_REPLY_TO`).

## Automatic quote-status sync

Once a lead is linked to a quote request, the CRM never asks an agent to manually enter what
happened with the quote:

- **Customer accepts or declines** (`/customer-quote/[token]`, unchanged public flow): the
  linked lead's stage is automatically set to `Customer accepted` / `Customer declined`, and a
  `crm_activities` entry is logged automatically (`agent_id` null, so it's visibly
  system-generated in the timeline) — see `syncCrmLeadOnCustomerResponse` in
  `src/app/customer-quote/[token]/actions.ts`. A sync failure never blocks the customer's own
  accept/decline.
- **Admin gives final approval**: a dedicated **Final Approval — Close Opportunity** button
  (only shown once the customer has responded) sets the lead to `Closed/completed` and logs
  the change. This is deliberately a separate action from the existing pre-send "Approve" step
  in the quote workflow (which approves price/content *before* sending) — there was no existing
  concept of admin sign-off *after* the customer responds, so this is new,
  CRM-side-only behavior; it doesn't touch the linked `quote_requests` row.

Agents can still correct a lead's stage manually within their own allowed set (see below), and
every manual change is recorded in the activity history the same way as any other activity
log entry.

### Agents can't set system-controlled stages

`Customer accepted`, `Customer declined`, and `Closed/completed` only ever come from the sync
above or the Final Approval action — never from an agent manually editing the stage dropdown.
This is enforced at the database level (migration `0009_crm_agent_stage_restriction.sql`): a
`BEFORE UPDATE` trigger on `crm_leads` raises an exception if the caller is a `role = 'agent'`
account and the stage is *changing* to a value outside the six agent-settable stages (`New
interested lead`, `Waiting for cleaning details`, `Quote requested from provider`, `Provider
quote received`, `Follow-up required`, `No response`). It only fires when the stage actually
changes, so an agent can still freely edit notes, contact info, or the follow-up date on a
lead that's already in a system-only stage. Admins, and the service-role client used by the
public customer-quote sync, are unaffected. The agent-facing UI also only offers the six
allowed stages in its dropdown, showing a read-only badge instead once a lead reaches a
system-only stage.

## Database

New migrations: [`0007_crm_leads.sql`](../supabase/migrations/0007_crm_leads.sql),
[`0008_crm_user_role_privileges.sql`](../supabase/migrations/0008_crm_user_role_privileges.sql)
(locks down a helper function's execute privileges),
[`0009_crm_agent_stage_restriction.sql`](../supabase/migrations/0009_crm_agent_stage_restriction.sql)
(the agent stage-restriction trigger above),
[`0010_crm_agent_isolation.sql`](../supabase/migrations/0010_crm_agent_isolation.sql) (roster
visibility + deactivation-gap fixes, see below), and
[`0011_crm_followups.sql`](../supabase/migrations/0011_crm_followups.sql) (the Follow-Up
Calendar table, RLS, and sync trigger, see above). Purely additive — no existing table, column,
or row is touched.

- **`crm_users`** — one row per Supabase Auth user who's part of the CRM: `full_name`, `email`,
  `role` (`admin` | `agent`), `active`.
- **`crm_leads`** — the lead itself: all the fields from the lead form, `stage` (the 10-stage
  pipeline), `assigned_agent_id` / `created_by` (→ `crm_users`), `next_follow_up_at`,
  `last_contacted_at`, and a nullable `quote_request_id` → `quote_requests` for the link to the
  existing quote workflow (a direct FK rather than a separate join table, since a lead maps to
  at most one active quote request).
- **`crm_activities`** — the append-only timeline: `activity_type` (call/email/text/voicemail/
  note/outcome), `notes`, `occurred_at`, and an optional `next_follow_up_at` that's copied onto
  the lead's current follow-up date when set.

### Row Level Security

Unlike the legacy quote tables (RLS enabled, no policies, service-role key only), these three
tables have real policies driven by `auth.uid()`:

- Admins (`crm_users.role = 'admin'`) can read, write, and delete every row.
- Agents can only `select`/`update` `crm_leads`/`crm_activities` rows tied to their own
  `assigned_agent_id` *while still an active agent* (see migration 0010 below), can `insert` a
  lead only assigned to themselves, and have no `delete` policy at all — matching "agents
  cannot permanently delete leads."
- Agents can only ever read their own `crm_users` row, never another agent's (migration 0010) —
  only admins can read the full roster.
- A `security definer` helper function (`crm_user_role`) looks up a caller's role without
  re-triggering RLS on `crm_users` itself; its `EXECUTE` privilege is restricted to the
  `authenticated` Postgres role (needed for policy evaluation) and revoked from `anon`.

The CRM's Server Components/Functions use the same session-scoped Supabase client (anon key +
user JWT) already used for admin login — so it's Postgres enforcing access, not just
application code. The one exception is reading the *linked* quote request's status/price/etc.
inside a CRM lead page: that goes through the service-role client (same pattern the existing
`/admin` dashboard already uses for `quote_requests`, which has no RLS policies of its own),
and only after the page has already confirmed — via the RLS-backed lead read — that the
caller is allowed to see that lead.

These policies were verified directly against the live database (temporarily flipping the one
existing account between `admin`/`agent` and confirming visibility, insert, update, and delete
behavior in each case) before this branch was opened as a PR.

## Inviting, deactivating, and removing agents

There is no public sign-up route anywhere in this app — the only way an agent account is ever
created is an admin inviting one from **`/admin/crm/agents`**:

1. Admin clicks **+ Add Agent** and enters a name and email — no password field. This calls
   `inviteAgentAction` (`src/app/admin/(dashboard)/crm/agents/actions.ts`), which uses the
   Supabase Auth Admin API (`inviteUserByEmail` — the one place in the CRM that needs the
   service-role key) to create the login and send the invitation email, then inserts the
   matching `crm_users` row with `role = 'agent'` immediately — every invited account
   automatically gets the Agent role, never Admin.
2. The agent receives an email and clicks the link, which lands on **`/agent/set-password`**
   with a valid temporary session (see "How the invite/reset link works" below) and sets their
   own password. They're then signed in and redirected to `/agent/dashboard`.
3. **Forgot password**: `/agent/login` has a "Forgot password?" link to **`/agent/forgot-password`**,
   which emails a reset link (same completion page, `/agent/set-password`) via
   `supabase.auth.resetPasswordForEmail`. The response is always the same generic "if an
   account exists…" message, whether or not the email is registered, to avoid leaking which
   emails have accounts.
4. **Deactivate**: toggling an agent's "Active" checkbox (in the existing edit form) immediately
   revokes their database-level access — see "Closing the deactivation gap" below — not just
   the app-level login check.
5. **Remove**: the new **Remove** button calls `removeAgentAction`, which hard-deletes the
   Supabase Auth user via the Admin API. `crm_users.id` references `auth.users(id) on delete
   cascade`, so the `crm_users` row goes with it; `crm_leads`/`crm_activities` only reference
   `crm_users` with `on delete set null`, so the agent's leads and activity history are kept,
   just unassigned — nothing about past work is destroyed. A confirmation dialog is required
   before this fires, since it's not reversible the way deactivating is.

### How the invite/reset link works

`inviteUserByEmail` and `resetPasswordForEmail` both point `redirectTo` at
`/agent/set-password`. Depending on the Supabase project's email template configuration, the
link the agent actually receives can take one of two forms:

- **`?token_hash=...&type=...`** (Supabase's current recommended template format) — handled by
  a new server-side route, **`src/app/auth/confirm/route.ts`**, which calls
  `supabase.auth.verifyOtp()` using the normal cookie-based server client and then redirects
  into `/agent/set-password` with a real session already established.
- **`#access_token=...&type=...`** (the older/default hash-fragment format) — the server never
  sees a URL fragment at all, so this is handled entirely client-side: `/agent/set-password`
  is the one page in this app that uses a browser Supabase client
  (`src/lib/supabase-browser.ts`, via `createBrowserClient` from `@supabase/ssr` — every other
  page uses the cookie-based server client), which auto-detects the fragment on load and
  establishes the session (and, critically, syncs it into cookies so the rest of the app's
  server-side checks pick it up too).

`/agent/set-password` handles both cases the same way after that: once any session is
detected, it shows a "set your password" form and calls `supabase.auth.updateUser({ password })`.

**Dependency you should check**: which format actually gets sent depends on the Supabase
project's Auth email template settings (Dashboard → Authentication → Email Templates) — this
isn't something a migration or this codebase controls. Building both paths means it works
either way, but it's worth sending yourself a test invite to confirm mail delivery is working
before relying on it for real agents.

### Which base URL the redirect link uses

`redirectTo` is built from `getAuthRedirectBaseUrl()` (`src/lib/site-url.ts`), not the
`getSiteUrl()` used elsewhere in this codebase — deliberately different, since an auth
redirect has to land back on the *same* deployment that sent the email:

- If `NEXT_PUBLIC_SITE_URL` is set, it's used as-is. This should only ever be set on Vercel's
  **Production** environment (scoped to Production only in Project Settings → Environment
  Variables) — e.g. `https://cleaning.winsalotcorp.com`.
- Otherwise it falls back to `VERCEL_URL`, which Vercel sets automatically to the current
  deployment's own hostname — this is what makes a Preview invite redirect back to that same
  preview, with zero configuration needed per-deployment.
- Otherwise, `http://localhost:3000` (local dev only).

**This code fix alone is not sufficient.** Supabase Auth only honors a `redirectTo` value that
matches an entry in the project's Redirect URLs allow-list (Authentication → URL
Configuration); anything else is silently replaced with the project's **Site URL**, dropping
the path entirely — landing on that domain's bare `/`, which on this project rewrites (see
`src/proxy.ts`) to a public marketing/quote page. The `access_token`/`type` hash fragment is
still appended to the URL when this happens (hash fragments are client-side only, so the
server-side fallback can't strip or validate them) — it's just stuck on the wrong page. See
the next section for the exact settings to add.

### Safety net: AuthInviteRedirector

Because a Site URL/Redirect URL mismatch strands a real, usable token on whatever page Site
URL points to — and that could be a public page — `src/components/AuthInviteRedirector.tsx` is
mounted in the root layout (`src/app/layout.tsx`) and runs on every single page. It does
nothing unless it sees an `#access_token=...` hash fragment with `type=invite` or
`type=recovery`, in which case it immediately forwards the browser to `/agent/set-password`
with that same fragment intact. This means an invitation/reset link can never leave someone on
a public page with a live token doing nothing, even if the Supabase dashboard configuration
drifts again later — but it's a safety net, not a substitute for the correct configuration
below, since a *server-side* Redirect URL mismatch (the `?token_hash=...` flow verified by
`/auth/confirm`) fails before any browser-side JavaScript ever runs.

### Supabase dashboard settings to update

In the Supabase dashboard, **Authentication → URL Configuration**:

- **Site URL**: set to your production domain, `https://cleaning.winsalotcorp.com` (currently
  likely still the default `http://localhost:3000` placeholder, or a domain that doesn't
  exactly match what's configured for this project).
- **Redirect URLs** (add, don't remove anything already relied on elsewhere):
  - `https://cleaning.winsalotcorp.com/agent/set-password`
  - `https://cleaning.winsalotcorp.com/auth/confirm`
  - A wildcard covering every Preview deployment of this Vercel project, e.g.
    `https://winsalot-funding-*-<your-vercel-team-slug>.vercel.app/**` — scoped to this
    project's own deployment URL pattern rather than a bare `https://*.vercel.app/**`, since
    the latter would let *any* Vercel deployment (not just yours) be used as an auth redirect
    target.

There is no need for a separate `/crm/setup-password` or `/admin/setup-password` route —
`/agent/set-password` already is that dedicated page (reads the invitation/reset session,
requires a password + confirmation, then redirects to `/agent/dashboard`); the fix is getting
Supabase to actually deliver its link there.

## Closing two access-control gaps (migration 0010)

Building real invite/deactivate/remove controls surfaced two gaps in the original `crm_users`/
`crm_leads` policies from migration 0007, both fixed in
[`0010_crm_agent_isolation.sql`](../supabase/migrations/0010_crm_agent_isolation.sql):

1. **Agents could read the entire `crm_users` roster.** The original
   `crm_users_select_active_members` policy let any active CRM member (agent or admin) select
   every row — every other agent's name, email, role, and active status — because it only
   checked "is the caller an active member," not whose row it was. No agent-facing code
   actually needs that (only the admin pages' agent-assignment dropdowns do), so it's now split
   into `crm_users_select_self` (an agent can only ever read their own row) and
   `crm_users_admin_select_all` (only admins get the full roster).
2. **Deactivating an agent didn't revoke their existing lead access at the database level.**
   `crm_leads_agent_select_own`/`_update_own` and the `crm_activities` equivalents only checked
   `assigned_agent_id = auth.uid()` — they never checked that the caller was still an *active*
   agent. The application-level check in `requireCrmUser()` already blocked a deactivated agent
   from any full-page navigation, but a direct Supabase client call bypassing that layer would
   still have worked. All four policies now also require `crm_user_role(auth.uid()) = 'agent'`
   (which itself requires `active = true`), so deactivation is an immediate, database-enforced
   lockout — verified directly against the live database (a lead the account could see while
   active became completely invisible to it the moment `active` was set to `false`, with no
   app code involved).

## What's intentionally not built yet

- Email/SMS reminders for follow-ups — the dashboards show due-today/overdue/waiting-on-
  response counts in-app; wiring the existing Resend/Twilio notifications to the CRM (e.g. a
  daily digest) was left out of this first pass to keep scope focused, per the brief's "use
  existing services only if already configured."
- Any in-app indicator of "invited but hasn't accepted yet" on the agents list — the invite
  either works or the admin sees an error; there's no separate pending/accepted status shown.

## Testing checklist

- [ ] Visiting `/agent/dashboard` while signed out redirects to `/agent/login`
- [ ] Visiting `/admin/crm` or `/admin/crm/agents` while signed out redirects to `/admin/login`
      (same as the existing `/admin` behavior)
- [ ] An existing admin account still reaches `/admin` and every existing quote-dashboard page
      exactly as before
- [ ] Inviting an agent from `/admin/crm/agents` (name + email, no password field) sends an
      email; clicking its link lands on `/agent/set-password` with a working "set password" form
- [ ] After setting a password, the agent is signed in and lands on `/agent/dashboard`
- [ ] `/agent/forgot-password` always shows the same generic confirmation message, whether or
      not the submitted email has an account; its reset link also completes at
      `/agent/set-password`
- [ ] `/agent/set-password` and `/agent/forgot-password` are reachable while signed out and
      don't redirect to `/agent/login`
- [ ] An invite/reset link lands on `/agent/set-password` with a working "set password" form —
      not on the homepage or any other public page, even if pasted into a fresh
      incognito/private window
- [ ] (Safety-net check) manually visiting any page with `#access_token=...&type=invite` in the
      URL immediately forwards to `/agent/set-password` with that same token
- [ ] Deactivating an agent immediately blocks their access to leads previously assigned to
      them, not just future logins (test by deactivating, then trying to load one of their
      leads with their existing session)
- [ ] Removing an agent (with confirmation) deletes their login; their past leads/activities
      remain, now unassigned, and are still visible/reassignable from `/admin/crm`
- [ ] An agent account is redirected away from `/admin` and cannot browse the quote dashboard
- [ ] An agent cannot read another agent's `crm_users` row (name/email/role) by any means
- [ ] An agent can add a lead from `/agent/leads/new` and it appears assigned to them
- [ ] An agent cannot see or open a lead assigned to a different agent (try the URL directly)
- [ ] Logging a call/email/text/voicemail/note/outcome on a lead appears in its timeline in
      chronological order and updates "next follow-up" when set
- [ ] An admin sees every lead on `/admin/crm`, grouped by agent, with working search/filters
      (name, phone, email, agent, city, stage)
- [ ] An admin can reassign a lead to a different agent and change its stage from
      `/admin/crm/leads/[id]`
- [ ] An admin can search for and link an existing quote request to a lead, and the linked
      quote's status/provider/price/customer response show up inside the lead
- [ ] Unlinking a quote clears that section without affecting the underlying quote request
- [ ] Deleting a lead (admin only) removes it and its activity history; agents have no delete
      control anywhere in the CRM
- [ ] Sending a quote from `/admin/crm/leads/[id]` uses "Winsalot Corp \<info@winsalotcorp.com\>"
      as the From address and `info@winsalotcorp.com` as Reply-To
- [ ] An agent's own lead page never shows a "Send Quote to Customer" control
- [ ] Accepting or declining a quote at `/customer-quote/[token]` automatically updates the
      linked lead's stage (no agent action required) and adds a system-generated timeline entry
- [ ] An agent's stage dropdown only offers the six agent-settable stages; a lead already in a
      system-only stage shows a read-only badge instead
- [ ] An agent cannot set a lead to `Customer accepted`/`Customer declined`/`Closed/completed`
      even by calling the action directly with a different stage value
- [ ] "Final Approval — Close Opportunity" only appears once the customer has responded, and
      marks the lead `Closed/completed` with a logged activity entry
- [ ] Scheduling a callback (from the dashboard's "+ Schedule Callback" or a lead's own
      "Scheduled Callbacks" section) appears in the correct Overdue/Today/Upcoming group
- [ ] "Mark Completed" removes a callback from the calendar and clears the lead's "Next
      Follow-up" once no other pending callback remains for it
- [ ] "Reschedule" updates a callback's date/time (and optionally its note) in place, without
      creating a duplicate entry
- [ ] "Add Note" on a callback logs a new entry in the lead's activity timeline
- [ ] An agent cannot see or affect another agent's callbacks, even for a lead momentarily
      guessed by id — the callback simply doesn't appear, and an attempted update affects zero
      rows
- [ ] Reassigning a lead to a different agent immediately moves its pending callbacks into that
      agent's calendar and out of the previous agent's
- [ ] `/admin/crm`'s "All Agents' Follow-Ups" section shows every agent's callbacks, filterable
      by agent, and has no action buttons (view-only)
- [ ] The existing `/commercial-cleaning-quote`, `/customer-quote/[token]`,
      `/provider-quote/[token]`, and `/sales-tracker` pages are all unaffected
- [ ] An agent can view and copy every entry on `/agent/training`, including the seeded
      "General Commercial Cleaning Call Script", but has no add/edit/remove controls there
- [ ] An admin can add, edit, and remove training materials from `/admin/crm/training`, and
      changes show up on `/agent/training` immediately
- [ ] An agent cannot add, edit, or delete a training material by calling the admin actions
      directly (blocked by `requireCrmAdmin()` and by RLS even if that check were bypassed)
- [ ] Sending a follow-up email from `/admin/crm/leads/[id]` or `/agent/leads/[id]` logs a
      "Follow-up email sent…" activity entry and creates a `crm_lead_emails` row with
      `status = 'sent'`
- [ ] A configured Resend webhook delivers `email.sent`/`email.delivered`/
      `email.delivery_delayed`/`email.bounced`/`email.complained`/`email.opened`/`email.clicked`
      events to `/api/webhooks/resend`, each appearing as its own timestamped `crm_activities`
      entry and updating the lead's displayed email status
- [ ] A `bounced` status highlights the lead (list row/card and detail page) with a message to
      correct the client's email address
- [ ] A `delivered` event never causes the lead to show as "Opened" — only an actual
      `email.opened` event does
- [ ] The `EmailStatusPanel` at the top of `/admin/crm/leads/[id]` and `/agent/leads/[id]` shows
      Sent/Delivered/Bounced/Failed timestamps (each "—" until its event happens) plus the
      latest status change, for the lead's most recently sent tracked email
- [ ] An `email.failed` event sets the Failed milestone/timestamp and shows the "check the reason
      before retrying" banner
- [ ] An unsigned or badly-signed request to `/api/webhooks/resend` is rejected (401) rather than
      updating any lead
- [ ] A Resend email unrelated to the CRM (e.g. an agent invite) produces no `crm_lead_emails`
      match and is silently ignored by the webhook handler
