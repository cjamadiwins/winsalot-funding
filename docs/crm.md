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
   (search by name, phone, or email) once one exists — the lead then shows the quote's status,
   provider, price, and customer response inline, without duplicating that data.
4. The assigned agent follows up after the quote is sent; the admin gives final approval and
   the customer accepts/declines through the *existing* `/customer-quote/[token]` flow,
   unchanged.
5. The lead is marked `Closed/completed` once the opportunity is resolved.

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

## Database

New migration: [`supabase/migrations/0007_crm_leads.sql`](../supabase/migrations/0007_crm_leads.sql)
(plus a small follow-up, [`0008_crm_user_role_privileges.sql`](../supabase/migrations/0008_crm_user_role_privileges.sql),
that locks down a helper function's execute privileges). Purely additive — no existing table,
column, or row is touched.

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
- [ ] The existing `/commercial-cleaning-quote`, `/customer-quote/[token]`,
      `/provider-quote/[token]`, and `/sales-tracker` pages are all unaffected
