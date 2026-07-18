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

## User roles

- **Admin** — every account that already exists today (see "Roles and the existing /admin
  dashboard" below). Full access to every lead, agent management, reassignment, deletion, and
  the quote-request link. Reachable at `/admin/crm`, `/admin/crm/leads/[id]`, and
  `/admin/crm/agents`.
- **Agent** — a new account type, created from `/admin/crm/agents`. Can only see and edit
  leads assigned to them, cannot delete a lead, cannot reassign a lead to someone else, and
  never sees `/admin/*`. Reachable at `/agent/login`, `/agent/dashboard`, `/agent/leads/new`,
  and `/agent/leads/[id]`.

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
(the agent stage-restriction trigger above), and
[`0010_crm_agent_isolation.sql`](../supabase/migrations/0010_crm_agent_isolation.sql) (roster
visibility + deactivation-gap fixes, see below). Purely additive — no existing table, column,
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
- [ ] The existing `/commercial-cleaning-quote`, `/customer-quote/[token]`,
      `/provider-quote/[token]`, and `/sales-tracker` pages are all unaffected
