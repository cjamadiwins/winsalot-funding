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
(locks down a helper function's execute privileges), and
[`0009_crm_agent_stage_restriction.sql`](../supabase/migrations/0009_crm_agent_stage_restriction.sql)
(the agent stage-restriction trigger above). Purely additive — no existing table, column, or
row is touched.

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
  `assigned_agent_id`, can `insert` a lead only assigned to themselves, and have no `delete`
  policy at all — matching "agents cannot permanently delete leads."
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

## Creating an agent account

From **`/admin/crm/agents`**, click **+ Add Agent** and set a name, email, and a temporary
password (min. 8 characters) — this calls the Supabase Auth Admin API server-side (the one
place in the CRM that needs the service-role key) to create the login and the matching
`crm_users` row together. Share the password with the agent so they can sign in right away at
`/agent/login`. There's no in-app password change yet, same as the existing admin account
model.

## What's intentionally not built yet

- Email/SMS reminders for follow-ups — the dashboards show due-today/overdue/waiting-on-
  response counts in-app; wiring the existing Resend/Twilio notifications to the CRM (e.g. a
  daily digest) was left out of this first pass to keep scope focused, per the brief's "use
  existing services only if already configured."
- Agent self-service password reset.

## Testing checklist

- [ ] Visiting `/agent/dashboard` while signed out redirects to `/agent/login`
- [ ] Visiting `/admin/crm` or `/admin/crm/agents` while signed out redirects to `/admin/login`
      (same as the existing `/admin` behavior)
- [ ] An existing admin account still reaches `/admin` and every existing quote-dashboard page
      exactly as before
- [ ] Creating an agent from `/admin/crm/agents` lets that email/password sign in at
      `/agent/login`
- [ ] An agent account is redirected away from `/admin` and cannot browse the quote dashboard
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
