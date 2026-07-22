# Cleaning Opportunities (CRM)

A lead-generation system that scans public, no-login sources for businesses and organizations
in Metro Vancouver/the Lower Mainland (BC) and the Greater Toronto Area (ON) showing recent
intent to buy commercial cleaning, janitorial, custodial, or building-maintenance services -
built as a new section of the *existing* Winsalot CRM, not a parallel system.

Every record is a **potential opportunity** surfaced from a public source, never a confirmed
buyer. The dashboard, the alert email, and this doc all describe them that way deliberately.

## Where it lives

- **Admin**: `/admin/crm/opportunities` (list - filters, bulk actions, CSV export, archive/
  merge/delete) and `/admin/crm/opportunities/[id]` (full detail, edit, assignment, activity
  timeline, follow-ups, audit log). Reachable from the "Cleaning Opportunities" link in the
  `/admin` nav, alongside the existing CRM/Agents links.
- **Agent**: `/agent/opportunities` (their own assigned opportunities only) and
  `/agent/opportunities/[id]` (view + call notes + follow-ups + status). Reachable from the
  "Cleaning Opportunities" link in the agent header.

There is **no separate login, role system, or CRM** for this feature - it reuses:
- **Authentication & roles**: the existing `crm_users` table and `role` column
  (`admin`/`agent`), `requireCrmAdmin()`/`requireCrmUser()` (`src/lib/crm-auth.ts`), and
  `/admin/login` / `/agent/login`. No new account type, no new login page.
- **Activity/notes timeline**: the existing `crm_activities` table (same `call`/`email`/
  `text`/`voicemail`/`note`/`outcome` types agents already use on leads), extended with a
  nullable `opportunity_id` alongside the existing `lead_id`.
- **Follow-up scheduling**: the existing `crm_followups` table (the same Follow-Up Calendar
  mechanism), extended the same way.

## How it works

1. A daily collection job (`src/lib/opportunities/run.ts`) runs each connector, dedupes,
   scores 0-100 with an intent level (Hot/Warm/Research), and inserts genuinely new records.
2. A newly-inserted **Hot** opportunity emails `info@winsalotcorp.com` (override with
   `OPPORTUNITY_ALERT_EMAIL`).
3. An **admin** reviews new records, edits business/contact details if needed, and assigns
   one to an agent (`/admin/crm/opportunities`). Assignment is a single `assigned_agent`
   column - reassigning shows the current agent first, so nothing is silently overwritten.
4. The **agent** sees it appear on `/agent/opportunities`, logs calls/notes, schedules
   follow-ups, and moves it through their status set as they work it - exactly the same
   day-to-day motion as working a CRM lead.
5. An admin archives, deletes, or merges records as the list needs cleanup, and everything
   that happens to a record - created, edited, assigned, reassigned, status changed, archived,
   restored, deleted, merged, by whom, and when - is on its audit log.

## Roles

### Admin can

View every opportunity (including archived); assign/reassign to any agent; edit all business
and contact information; review every agent's notes and activity; filter and export the
current list to CSV; archive/restore; permanently delete (with confirmation); bulk archive or
delete a selection; merge duplicates into a primary record.

### Agent can

See only opportunities assigned to them; view organization, city, service needed, public
phone, public email, deadline, intent level, and the original source link; add call notes
(via `crm_activities`); set/change follow-up dates (via `crm_followups`); update status -
**within the agent-facing status set only**: New, Contacted, No answer, Follow-up required,
Quote requested, Converted, Not suitable, Expired.

### Agent cannot

Permanently delete records (no delete policy, no delete action exists in the agent UI);
reassign records to another agent (blocked by both RLS and a database trigger); change intent
scores or original source details (same trigger); edit business/contact information (same
trigger - only admins have the edit form); see archived records (excluded by RLS) or
opportunities assigned to someone else (excluded by RLS).

This is enforced in three independent layers, same defense-in-depth as the rest of this CRM:
1. **RLS row-level policies** - an agent's `select`/`update` policies only match rows where
   `assigned_agent = auth.uid()` and `archived_at is null`.
2. **A database trigger** (`active_cleaning_opportunities_restrict_agent_edits`, migration
   `0012`) - column-level: even on their own assigned row, an agent's `UPDATE` is rejected if
   it touches `assigned_agent`, `intent_score`, `intent_level`, `source_name`, `source_url`,
   or any business/contact field, or sets `status` to anything outside the agent-facing list.
3. **Application code** - the agent-facing Server Actions
   (`src/app/agent/(dashboard)/opportunities/actions.ts`) never expose a field-edit, assign,
   archive, or delete action in the first place; the UI never renders those controls.

## Table columns (list view)

Organization name, City, Service needed, Contact name, Public phone, Public email, Deadline,
Intent level, Status, Assigned agent, Last follow-up date - plus admin-only bulk-select
checkboxes and Details/Archive/Delete row actions. (The detail page shows everything else -
description, source, intent score, date posted/discovered, next follow-up, notes, timeline,
audit log.)

## Record safety

- **Soft delete by default**: `archived_at`/`archived_by` columns. Archived records are
  excluded from the default admin list view (switchable to Archived/All) and from agents
  entirely (RLS), but stay in the database, restorable with one click.
- **Permanent deletion requires confirmation** in the UI (single-record and bulk) and cascades
  correctly: `crm_activities`/`crm_followups` rows tied to that opportunity are removed with it
  (`on delete cascade`), but its audit log entry survives (`opportunity_id` set to `null`, with
  a title snapshot) so "who deleted it and when" isn't lost.
- **Audit log** (`active_cleaning_opportunities_audit_log`, migration `0012`): a row-level
  trigger automatically records every `created`/`edited`/`assigned`/`reassigned`/`unassigned`/
  `status_changed`/`archived`/`restored`/`deleted` event with the actor and timestamp (a `null`
  actor means the daily collection job, not a person). `merged` events are written explicitly
  by the merge action. Admin-only read (`/admin/crm/opportunities/[id]`'s Audit Log panel); no
  session-scoped role can write to it directly, only the trigger and one explicit service-role
  write in the merge action.
- **Duplicate assignment**: `assigned_agent` is a single column, so an opportunity is never
  simultaneously assigned to two agents. The admin UI always shows the current assignee before
  a reassignment is made, and reassigning promotes `status` from New/Reviewing to Assigned but
  never regresses a record an admin has already moved further along.
- **Merge duplicates**: admin multi-select two or more records, choose which one is primary,
  and confirm - every note and follow-up on the others is moved onto the primary (nothing an
  agent logged is lost), then the others are archived (not hard-deleted, so they're still
  reviewable/removable afterward). This is a manual action, not an automatic fuzzy-duplicate
  detector - the collection job's own dedup (`src/lib/opportunities/dedupe.ts`) already
  prevents most true duplicates from ever being inserted; this tool is for what slips through
  (a manually-added test row, a near-duplicate from a slightly different source, etc.).

## Intent scoring

Only ever computed for a record the cleaning-relevance filter above has already accepted
(`src/lib/opportunities/scoring.ts`):

- Strong cleaning phrase in the **title**: +50; phrase only in description/category: +35
- Explicit request term (RFP, RFQ, proposal, bid, tender, quotation) in title or description: +20
- Deadline within 30 days: +15
- Confirmed Metro Vancouver/GTA location: +15
- Public email or phone available: +10
- Posted within the last 14 days: +10
- Score capped at 100. **Hot: 70-100, Warm: 45-69, Research: 0-44.**

There's no "Rejected" intent level in the database - a rejected candidate is never inserted at
all (see "Cleaning-relevance filter" above), so every stored row is already confirmed
cleaning-specific by definition.

## CSV export

Admin-only, client-side: the **Export CSV** button on `/admin/crm/opportunities` serializes
whatever's currently loaded and filtered in the browser (no server round trip, no new API
route) into a CSV download. It's explicitly for backup/reporting - the dashboard stays the
system of record and the primary place work happens.

## Cleaning-relevance filter

The first live run imported two government tenders that turned out not to belong: one was a
broad, multi-trade facilities-maintenance tender for ~100 Northern Canada buildings (HVAC,
plumbing, landscaping, pest control, security, and "Janitorial Services" as one line item
among a dozen unrelated ones), the other was a genuine janitorial tender - but for Ottawa, not
Metro Vancouver/the GTA. Both also got mis-tagged with the city "King, Ontario" because the
old location logic did a plain substring search for a target city name across the whole
description, and "King" matched inside "par**king**" and "see**king**" - the "positive
match required" and "no guessing location" rules below exist specifically to prevent both
failure modes. Both bad records were reviewed, marked `Not suitable`, left unassigned, and
their audit log entries explain why (see `active_cleaning_opportunities_audit_log`).

**Positive match required** (`src/lib/opportunities/cleaning-relevance.ts`): a record is only
ever considered a candidate if its title, description, or category contains at least one of a
fixed list of strong, unambiguous cleaning-related phrases (`commercial cleaning`,
`janitorial services`, `custodial services`, `cleaning contract`, `sanitation services`,
`disinfection services`, etc. - the full list is in that file). Generic procurement vocabulary
(`RFP`, `tender`, `procurement`, `facilities`, `construction`, `maintenance`, `property
management`, `government services`, `building services`, `vendor services`) is never enough on
its own.

**Title carries the deciding weight.** A strong phrase in the title accepts the record outright.
A strong phrase found only in the description/category is accepted unless either: the title
itself is dominated by an exclusion term (`construction`, `HVAC`, `plumbing`, `landscaping`,
`security`, `pest control`, `snow removal`, `staffing`, `laundry`, `food services`, etc.), or
two or more distinct exclusion terms appear in the body alongside it - the second check is
what would have caught the Northern Canada facilities tender.

**Location is never guessed.** `lookupCity()` (`src/lib/opportunities/cities.ts`) now matches
on word boundaries, not a raw substring, so "King" can no longer match inside "parking" or
"seeking." More importantly, the CanadaBuys connector now resolves a record's city **only**
from the feed's own structured buyer-city column - the old fallback that scanned the whole
title/description for any target-city mention has been removed entirely. A record whose buyer
city isn't itself a confirmed Metro Vancouver/GTA market is left out, never guessed at from
unrelated text. (BC Bid's scraped listings have no structured location field to fall back to,
so that connector still does a word-boundary text scan as a best-effort measure - flagged as a
known limitation in its own file.)

**Data quality fields** (migration `0015`): every accepted record stores `matched_cleaning_terms`
(the exact strong phrase(s) that got it accepted, `text[]`) and `accepted_reason` (a short
human-readable explanation) - visible on the record's detail page and included in CSV export.
A rejected candidate is never persisted at all; its title, source, and rejection reason are
only kept in that run's summary (`CollectionSummary.rejectedSamples`), shown on the admin
dashboard after **Run Collection Now**, never written to the database or shown in the normal
CRM list. Both new columns are protected by the same agent column-restriction trigger as
`intent_score`/`source_url` - an agent can never edit them.

## Compliance approach (unchanged from Phase 1)

- **robots.txt is enforced at runtime** by every HTML-scraping connector
  (`src/lib/opportunities/robots.ts`), failing closed if it can't confirm permission. The
  CanadaBuys connector reads a published open-data CSV file, not a crawled page, so this
  doesn't apply to it.
- No login, CAPTCHA-bypass, or paywall access anywhere.
- Every record stores `source_url`, `source_name`, and `date_discovered`.
- Only organization-level public contact info is ever stored - no private groups/profiles, no
  sensitive personal data.

## Phase 1 sources (connectors)

Unchanged from the original Phase 1 build - see the connector table and "Activating municipal
portals" notes that used to be here; the source code lives in
`src/lib/opportunities/connectors/`:

- `canadabuys.ts` - CanadaBuys open-data tender feed. Live.
- `bcbid.ts` - BC Bid public opportunity browse page. Live, best-effort HTML parse - needs a
  live smoke test after first deploy (this sandbox has no outbound network access to verify
  it).
- `bidsandtenders.ts` / `municipal-portal.ts` - per-municipality tender portals. Ships with an
  **empty** config list on purpose (unverified subdomains aren't shipped as if confirmed) -
  see the comment in `bidsandtenders.ts` for how to activate one.

Search-engine and social-post connectors remain out of scope for Phase 1 (need a paid,
ToS-compliant search API).

## Database

Four migrations, **all applied to the live "Business Finance" Supabase project** and verified
(tables/policies/functions/permissions confirmed to exist; existing CRM and quote-system row
counts confirmed unchanged before/after each):

- **[`0012_active_cleaning_opportunities.sql`](../supabase/migrations/0012_active_cleaning_opportunities.sql)**
  - the `active_cleaning_opportunities` table itself (`archived_at`/`archived_by`,
    `next_follow_up_at`/`last_contacted_at` mirroring `crm_leads`' derived/contact-tracking
    columns, and the full 10-status list), its RLS policies (admin-all, agent-select-own,
    agent-update-own), the column-restriction trigger, the `updated_at` trigger, and the new
    `active_cleaning_opportunities_audit_log` table + its trigger.
- **[`0013_crm_opportunities_integration.sql`](../supabase/migrations/0013_crm_opportunities_integration.sql)**
  - **alters the already-applied** `crm_activities` and `crm_followups` tables (from
    migrations `0007`/`0011`): adds a nullable `opportunity_id` alongside the existing
    `lead_id`, a check constraint requiring exactly one of the two to be set, extends the
    agent-facing RLS policies to cover both targets, and replaces
    `crm_followups_sync_lead_next_follow_up()` (`create or replace`, same function name) so it
    maintains `next_follow_up_at` on whichever side applies. Every existing lead-only row and
    query keeps working unchanged.
- **[`0014_fix_search_path_set_updated_at.sql`](../supabase/migrations/0014_fix_search_path_set_updated_at.sql)**
  - adds `set search_path = public` to `active_cleaning_opportunities_set_updated_at` (a
    Supabase security-advisor finding on the one function from `0012` that was missing it - no
    behavior change).
- **[`0015_cleaning_relevance_filter_fields.sql`](../supabase/migrations/0015_cleaning_relevance_filter_fields.sql)**
  - adds `matched_cleaning_terms text[]` and `accepted_reason text` to
    `active_cleaning_opportunities`, and extends the agent column-restriction trigger to
    protect both.

All four are additive to the schema; `0013` is the only one that touches a table with existing
production data, and it only adds a column + loosens a `not null` constraint + adds policies -
no existing row or value was modified (verified by row-count comparison before/after).

## Environment variables

Unchanged from Phase 1: `CRON_SECRET`, `OPPORTUNITY_ALERT_EMAIL` (new), plus the existing
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`.

## Enabling the daily cron

Still deliberately disabled - no `crons` entry in `vercel.json` yet. See the original
Phase 1 instructions (unchanged): set `CRON_SECRET`, add the `crons` entry, redeploy.
`GET /api/cron/cleaning-opportunities` (with the bearer header) works today for manual
testing.

## Testing plan

**Schema / RLS (run directly against a test project before applying to production):**
1. Apply `0012` then `0013` to a scratch/staging Supabase project (not production).
2. As an admin session: confirm full read/write/delete on `active_cleaning_opportunities`,
   including archived rows; confirm reading `active_cleaning_opportunities_audit_log`.
3. As an agent session, on an opportunity assigned to them: confirm `select`/`update` work;
   confirm `update` to `status='Contacted'` succeeds; confirm `update` to `status='Reviewing'`
   is rejected by the trigger; confirm `update` to `assigned_agent` (any value) is rejected;
   confirm `update` to `intent_score`/`source_url`/`organization_name` is rejected; confirm
   `delete` is rejected (no policy).
4. As an agent session, on an opportunity **not** assigned to them: confirm `select` returns
   nothing and `update` affects zero rows.
5. Archive an opportunity as admin; confirm it disappears from the agent's `select` immediately
   and from the admin's default (Active) list view, but is still visible under Archived/All.
6. Insert a `crm_followups` row with `opportunity_id` set and `status='pending'`; confirm
   `active_cleaning_opportunities.next_follow_up_at` updates to match; mark it completed;
   confirm it clears (or moves to the next pending one).
7. Confirm every existing CRM RLS/trigger test in `docs/crm.md`'s testing checklist still
   passes unchanged (lead-only behavior must be untouched by `0013`).

**Application:**
8. Sign in as admin, visit `/admin/crm/opportunities`, click **Run Collection Now**; confirm
   new records appear with correct scores/levels and the summary cards match.
9. Assign a record to an agent; sign in as that agent and confirm it appears on
   `/agent/opportunities` and **only** that record (not other agents').
10. As the agent: add a call note, schedule a follow-up, mark it completed, change status to
    each agent-allowed value; confirm the admin detail page's Activity/Audit Log panels show
    all of it in real time (after refresh).
11. As admin: edit business/contact fields, reassign to a different agent, confirm the
    previous agent immediately loses access.
12. Select 2+ records, use **Merge Into Primary**; confirm the non-primary records' notes/
    follow-ups now show up under the primary, and the non-primary records are archived.
13. Archive, restore, delete (single and bulk, with confirmation) - confirm each audit log
    entry is recorded.
14. Filter every column, then **Export CSV**; confirm the downloaded file matches the filtered
    list.
15. Confirm `/commercial-cleaning-quote`, `/admin` (quote dashboard), `/admin/crm` (leads),
    `/admin/crm/agents`, `/agent/dashboard`, `/agent/leads/*` are all completely unaffected.
16. Run **Run Collection Now** with **Skip Hot-alert email for this run** checked; confirm the
    results panel shows candidates found/accepted/rejected, Hot/Warm/Research/duplicate/expired
    counts, a per-source breakdown, and a sample of rejected records with reasons; confirm no
    email was sent (`hotAlertsSkipped` matches the Hot count, `hotAlertsSent` is 0) and no
    record was auto-assigned. Spot-check a few accepted records' detail pages for a sensible
    `matched_cleaning_terms`/`accepted_reason`.

## Deployment instructions

Migrations `0012`-`0015` are applied to the live Supabase project already. What's left:

1. Merge the PR / deploy the app itself to production (not yet done - still only on the PR's
   Vercel preview deployment as of this writing).
2. Set `CRON_SECRET` and (optionally) `OPPORTUNITY_ALERT_EMAIL` in Vercel.
3. Run **Run Collection Now** with **Skip Hot-alert email for this run** checked, review the
   results panel (candidates found/accepted/rejected, Hot/Warm/Research/duplicate/expired
   counts, rejected samples with reasons), and get sign-off before enabling the cron.
4. Only then add the `crons` entry to `vercel.json` and redeploy - see "Enabling the daily
   cron" above.

## What's intentionally not built yet

- Search-engine and social-post connectors (Phase 2, needs a paid search API).
- Automatic fuzzy-duplicate *detection* (the merge tool is manual/admin-initiated; the
  collection job's own dedup already prevents most true duplicates).
- The municipal-portal (bids&tenders/Biddingo) connector list ships empty pending
  verification of each municipality's real public URL.
- A combined admin view mixing leads and opportunities in one table - they're deliberately
  kept as separate CRM sections (separate list pages) since they have different field shapes,
  even though they now share the same activity/follow-up/audit mechanisms underneath.

## Sample opportunity record

```json
{
  "organization_name": "Riverside Medical Clinic",
  "opportunity_title": "Request for Proposal - Janitorial Services",
  "description": "The Riverside Medical Clinic is seeking proposals from qualified janitorial contractors for daily office and medical-space cleaning at its Surrey location...",
  "opportunity_type": "rfp_tender",
  "service_needed": "Medical office cleaning",
  "city": "Surrey",
  "province": "BC",
  "contact_name": "Procurement Office",
  "public_email": "procurement@example-clinic.ca",
  "public_phone": null,
  "website": "https://bcbid.gov.bc.ca/page.aspx/en/rfp/request_summary_public/12345",
  "source_name": "BC Bid (Province of British Columbia)",
  "source_url": "https://bcbid.gov.bc.ca/page.aspx/en/rfp/request_summary_public/12345",
  "date_posted": "2026-07-14",
  "deadline": "2026-08-04",
  "date_discovered": "2026-07-22T13:00:00.000Z",
  "intent_score": 100,
  "intent_level": "Hot",
  "status": "New",
  "assigned_agent": null,
  "notes": null,
  "next_follow_up_at": null,
  "last_contacted_at": null,
  "archived_at": null,
  "matched_cleaning_terms": ["janitorial services"],
  "accepted_reason": "Title contains a confirmed cleaning-specific phrase: \"janitorial services\"."
}
```

(`intent_score` here: 50 rfp_tender + 20 deadline-within-30-days [13 days out] + 15 BC
location + 10 public email + 15 posted-within-14-days [8 days old] = 110, clamped to 100.)
