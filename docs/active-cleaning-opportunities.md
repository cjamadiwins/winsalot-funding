# Cleaning Opportunities (CRM)

A daily commercial-cleaning lead engine that scans public, no-login sources for businesses and
organizations in Metro Vancouver/the Lower Mainland (BC) and the Greater Toronto Area (ON) -
built as a new section of the *existing* Winsalot CRM, not a parallel system. Two lead
categories share one table, one status pipeline, and one CRM workflow:

- **Active Opportunities** - direct, publicly-expressed cleaning intent (tenders, RFPs, quote
  requests). The strict tender collector from the original build, unchanged.
- **Qualified Prospects** - strong-fit businesses in target industries (medical clinics, gyms,
  daycares, restaurants, etc.) that haven't publicly requested cleaning yet, sourced daily from
  OpenStreetMap's free, no-API-key Overpass directory, rotating through every target city over
  time rather than repeatedly searching the same handful. See "Qualified Prospects" below.

Every record is a **potential opportunity or prospect** surfaced from a public source, never a
confirmed buyer. The dashboard, the alert email, and this doc all describe them that way
deliberately.

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

1. A daily collection job (`src/lib/opportunities/run.ts`) runs every connector - both the
   Active Opportunity tender connectors and the Qualified Prospects connector - dedupes across
   both categories against the same table, scores each record 0-100 with an intent level
   (Hot/Warm/Prospect), and inserts genuinely new records.
2. A newly-inserted **Hot** opportunity emails `info@winsalotcorp.com` (override with
   `OPPORTUNITY_ALERT_EMAIL`) - Qualified Prospects never trigger this, since a prospect can
   never score Hot by construction (see "Intent scoring" below).
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

See only opportunities assigned to them; view organization, city, address, service needed,
public phone, public email, deadline, intent level, and the original source link; add call
notes (via `crm_activities`); set/change follow-up dates (via `crm_followups`); update status -
**within their record's own category's agent-facing status set**:
- **Active Opportunity**: New, Contacted, No answer, Follow-up required, Quote requested,
  Converted, Not suitable, Expired.
- **Qualified Prospect**: Verified, Invalid, Called, Interested, Follow-up, Not Interested.
  (`Unverified Prospect` is the system-set default a new prospect starts at - not something an
  agent chooses, same as a tender's `New`.)

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
   `0012`, extended in `0015`/`0016`/`0017`) - column-level: even on their own assigned row, an
   agent's `UPDATE` is rejected if it touches `assigned_agent`, `intent_score`, `intent_level`,
   `source_name`, `source_url`, `osm_id`, `lead_category`, `industry`, or any business/contact/
   address field, or sets `status` to anything outside their record's own category's
   agent-facing list (checked against `lead_category`, not a single shared list).
3. **Application code** - the agent-facing Server Actions
   (`src/app/agent/(dashboard)/opportunities/actions.ts`) never expose a field-edit, assign,
   archive, or delete action in the first place; the UI never renders those controls.

## Table columns (list view)

Category (Active Opportunity / Qualified Prospect badge), Organization name, City, Service
needed/Industry, Contact name, Public phone, Public email, Deadline, Intent level, Status,
Assigned agent, Last follow-up date - plus admin-only bulk-select checkboxes and
Details/Archive/Delete row actions. (The detail page shows everything else - description,
industry, address, OpenStreetMap ID, source, intent score, matched cleaning terms/accepted
reason, date posted/discovered, next follow-up, notes, timeline, audit log.) A **Category**
filter (admin list) narrows to just one lead type; the shared **Status** filter includes both
categories' status vocabularies, since they're all one `status` column underneath.

## Lead categories

Both categories live in the same `active_cleaning_opportunities` table (`lead_category`
column, migration `0016`) rather than a second table or CRM section, because they share
everything downstream: the same status pipeline, the same assignment/agent-visibility rules,
the same `crm_activities`/`crm_followups` timeline, the same audit log, the same dedup logic.
Only how a record is *found and scored* differs:

- **Active Opportunity** - unchanged from the original build: CanadaBuys, BC Bid, and
  municipal-portal connectors, gated by the strict cleaning-relevance filter (see below).
- **Qualified Prospect** - `src/lib/opportunities/connectors/qualified-prospects.ts` queries
  OpenStreetMap's Overpass API for businesses in the brief's target industries (property/office
  management has no reliable OSM tag and is a known coverage gap - see the comment in
  `industries.ts`), one target city at a time from a **daily rotation** across all 47 target
  cities (`src/lib/opportunities/rotation.ts`), keeping only records with a confirmed
  target-city address and a public phone or email.

`opportunity_type` gained a `qualified_prospect` value (alongside the existing
`rfp_tender`/`quote_request`/`hiring_signal`/`new_location`/`other`) and the table gained
`industry`, `address`, and `osm_id` columns (nullable, only ever populated for prospects
today).

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

`intent_level`'s third tier was renamed **`Research` → `Prospect`** (migration `0016`) once it
became a shared field: a weak-signal tender still lands there, and it's also the default tier
for a Qualified Prospect with no detected buying signal - "Prospect" reads correctly for both.
Existing rows were migrated, not dropped. Thresholds unchanged: **Hot 70-100, Warm 45-69,
Prospect 0-44.**

**Active Opportunities** (`scoreOpportunity()`) - only ever computed for a record the
cleaning-relevance filter has already accepted:
- Strong cleaning phrase in the **title**: +50; phrase only in description/category: +35
- Explicit request term (RFP, RFQ, proposal, bid, tender, quotation) in title or description: +20
- Deadline within 30 days: +15
- Confirmed Metro Vancouver/GTA location: +15
- Public email or phone available: +10
- Posted within the last 14 days: +10

**Qualified Prospects** (`scoreQualifiedProspect()`) - deliberately simpler and **capped below
Hot** (max score 69): a prospect has no confirmed cleaning request by definition, so it can
never out-score its way into the Hot band - a business that *does* show a confirmed request
belongs in Active Opportunities instead. Base score 20, +5 for a confirmed city, +5/+10 for
one/both of phone+email, +5 for a website, +25 for a detected buying signal (new location,
hiring pattern, relocation - `src/lib/opportunities/prospect-signals.ts`). The non-signal
bonuses are capped so they can never add up past 40 on their own (below the 45 Warm floor) -
without a detected signal, a prospect always stays `Prospect` regardless of how complete its
contact info is; the +25 signal bonus alone guarantees at least `Warm` (min 20+25=45) whenever
one's found, matching "Warm requires a strong public buying signal," not just complete contact
info. In practice, the OSM-sourced connector has no free-text description to check for a buying
signal, so today's prospects land at **Prospect** tier almost every time - that's expected; the
Warm-upgrade path exists for a future connector with richer text (news, reviews, job postings).

There's no "Rejected" intent level in the database - a rejected candidate is never inserted at
all (see "Cleaning-relevance filter" below), so every stored row is already either a confirmed
cleaning-specific tender or a confirmed target-industry business with valid contact info.

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
- OpenStreetMap data is used under its Open Database License (ODbL); the admin dashboard's
  **Last Successful Search** panel carries the required "© OpenStreetMap contributors"
  attribution and a link to `openstreetmap.org/copyright`. Query volume/frequency (one call per
  city/industry pair, sequential with a 1s delay, ~45 calls/day) stays well inside OSM's public
  Overpass instance fair-use expectations.

## Sources (connectors)

`src/lib/opportunities/connectors/`:

**Active Opportunities:**
- `canadabuys.ts` - CanadaBuys open-data tender feed. Live.
- `bcbid.ts` - BC Bid public opportunity browse page. Live, best-effort HTML parse - needs a
  live smoke test after first deploy (this sandbox has no outbound network access to verify
  it).
- `bidsandtenders.ts` / `municipal-portal.ts` - per-municipality tender portals. Ships with an
  **empty** config list on purpose (unverified subdomains aren't shipped as if confirmed) -
  see the comment in `bidsandtenders.ts` for how to activate one.

**Qualified Prospects:**
- `qualified-prospects.ts` - OpenStreetMap's Overpass API (`overpass-api.de`), a free, public,
  no-API-key business/POI directory, explicitly intended for this kind of programmatic query
  under OSM's own usage policy. One query per **(city, industry) pair**, drawn from a **daily
  rotation** (`rotation.ts`) across the full matrix of 47 target cities × 13 mapped industries
  (611 pairs total) - 45 pairs per run, cycling through the whole matrix roughly every two
  weeks, so no city/industry combination goes stale for long. Run **sequentially with a 1s
  delay between calls**, out of respect for the shared public instance, plus a 30s overall time
  budget so a slow run can't blow past the cron route's 60s `maxDuration`, and capped at **50
  candidates per run** ("up to 50 new prospects per day" - never padded with invented records
  if fewer valid businesses turn up). Also unverified against a live fetch - same sandbox
  limitation as BC Bid.
  - Each city's Overpass query area comes from an approximate centre + radius in
    `cities.ts` (`bboxForCity()`) - sized only to bound the query, never used to decide a
    result's city.
  - City comes only from the POI's own `addr:city` tag, never guessed from the query's target
    city or its bounding box - a result inside the bbox but tagged with a different (or no)
    city is rejected, not reattributed.
  - Address is built only from structured `addr:housenumber`/`addr:street`/`addr:city`/
    `addr:province`/`addr:postcode` tags, never geocoded or guessed - missing pieces are
    omitted rather than padded.
  - `osm_id` (`"node/12345"` / `"way/6789"`) is stored on every record - the strongest possible
    duplicate identity, since it names the exact same real-world OSM element even if its name,
    phone, or `source_url` later changes.
  - A record is kept only if it has a name, a confirmed target-city `addr:city`, and a public
    phone or email - see "Qualified Prospect requirements" below.
  - Property management and office-building management companies have no reliable OSM tag and
    aren't covered by this connector - a known gap, not an oversight (see the comment in
    `industries.ts`).
  - Every daily run is logged to `opportunity_collection_runs` (migration `0017`): cities
    searched, industries searched, candidates found, new records added, duplicates skipped, and
    any errors - shown in the admin dashboard's persistent **Last Successful Search** panel
    (unlike the ephemeral post-click Collection Run panel, this survives a page reload and
    reflects the cron's own runs too).

Search-engine and social-post connectors remain out of scope (need a paid, ToS-compliant
search API).

## Qualified Prospect requirements

A prospect is only accepted with: business/organization name, a confirmed target-city
address, industry, a public phone or email, a website/source URL, a reason it fits commercial
cleaning (`accepted_reason`), and a discovery date. Excluded automatically: no usable business
name, no confirmed target-city address (never guessed), no public phone or email (prospects
can never be Hot, so unlike an Active Opportunity there's no confirmed intent to offset
missing contact info), and anything that would already be a duplicate in the CRM (same dedup
pass as Active Opportunities - see below). Residential-only businesses, individual landlords,
and closed businesses aren't distinguishable from OSM's tags alone; if a future connector adds
a source with that signal, it should reject on it the same way.

## Duplicate prevention across categories

Both categories dedupe against the *same* table with the *same* base logic
(`src/lib/opportunities/dedupe.ts` + the `source_url`/`opportunity_title` unique index) - an
Active Opportunity and a Qualified Prospect for the same organization aren't treated as
duplicates of each other (they're different signals - a confirmed tender vs. a general
business-fit match - and both are worth surfacing), but two runs finding the same OSM node or
the same tender never produce two rows. Two records are treated as the same:
- Same `source_url` + `opportunity_title` (the common case), or
- Same organization + title + deadline from a different URL (a tender re-published with a
  tracking parameter), or
- **Same `osm_id`** - the exact same OpenStreetMap element, regardless of anything else, or
- **Same organization name plus any one matching phone, website, or address** - a prospect
  re-appearing under a slightly different `source_url` (which embeds the OSM element type/id,
  occasionally changed by an OSM edit between runs).

Checked both within a single run's own candidates and against everything already stored
(`source_url`, `opportunity_title`, and `osm_id` are each queried separately with safe `.in()`
calls, never a hand-built filter string from untrusted scraped text).

## Daily Summary

`/admin/crm/opportunities` shows a persistent **Today's Summary** panel (not just after a
manual run): New Hot, New Warm, New Qualified Prospects, With Phone, With Email, Assigned,
Contacted, and Quote Requests Generated - all computed from today's discovered records'
*current* state (client-side, from what's already loaded - no extra query). Two figures from
the brief aren't shown here because they're not derivable after the fact: **duplicates
skipped** and **rejected records** are never persisted (a rejected/duplicate candidate never
becomes a row), so they only ever appear in the **Collection Run** panel immediately after a
**Run Collection Now** click, for that specific run.

## Database

Six migrations, **all applied to the live "Business Finance" Supabase project** and verified
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
- **[`0016_qualified_prospects.sql`](../supabase/migrations/0016_qualified_prospects.sql)**
  - renames `intent_level`'s `Research` value to `Prospect` (existing rows updated first, then
    the check constraint is redefined - the constraint must be dropped *before* the rename
    update, not after, or the update itself violates the still-active old constraint), adds
    `lead_category` (`Active Opportunity` / `Qualified Prospect`, default `Active Opportunity`
    so every existing row is correctly categorized with no manual backfill needed) and
    `industry`, adds `qualified_prospect` to the `opportunity_type` check constraint, and
    extends the agent column-restriction trigger to protect the two new fields.
- **`0017_qualified_prospect_engine.sql`** (pending your approval - not yet applied)
  - adds `address` and `osm_id` columns; extends the `status` check constraint with the seven
    Qualified Prospect statuses (`Unverified Prospect`, `Verified`, `Invalid`, `Called`,
    `Interested`, `Follow-up`, `Not Interested`) alongside the existing ten Active Opportunity
    ones; adds the `opportunity_collection_runs` log table (admin-only read, service-role-only
    write); and extends the agent column-restriction trigger so the allowed status set branches
    by `lead_category`, and `address`/`osm_id` join the other agent-protected fields.

The first five are additive to the schema; `0013` is the only one of them that touches a table
with existing production data, and it only adds a column + loosens a `not null` constraint +
adds policies - no existing row or value was modified (verified by row-count comparison
before/after). `0016` is the only migration in this feature so far that **rewrote** an existing
column's data (the `Research` → `Prospect` rename) rather than only adding - applied and
verified: the rename affected exactly the one pre-existing row that had `intent_level =
'Research'`, and all other CRM/quote data was confirmed unchanged before/after. `0017` is
purely additive again (new columns, new table, a widened check constraint) - no existing row's
data changes.

### Applying migration 0017

Not yet applied - waiting on your approval, consistent with every prior schema change in this
feature.

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
    results panel shows candidates found/accepted/rejected, new Active Opportunity vs. new
    Qualified Prospect counts, Hot/Warm/Prospect/duplicate/expired counts, with-phone/
    with-email counts, a per-source breakdown, and a sample of rejected records with reasons;
    confirm no email was sent (`hotAlertsSkipped` matches the Hot count, `hotAlertsSent` is 0)
    and no record was auto-assigned. Spot-check a few accepted records' detail pages for a
    sensible `matched_cleaning_terms`/`accepted_reason` and (for prospects) `industry`.
17. Confirm the **Today's Summary** panel updates to reflect newly-inserted records without a
    page reload issue, and that its numbers match what's actually in the table for today.
18. Filter by **Category** (Active Opportunity / Qualified Prospect) and confirm the table,
    stat cards, and CSV export all respect it.
19. (After `0017` is applied) Run **Run Collection Now** twice on two different days (or by
    temporarily adjusting the system date in a test environment); confirm the **Last
    Successful Search** panel updates with a different set of cities/industries each time
    (rotation working), and that a newly-inserted prospect's `status` is `Unverified Prospect`,
    not `New`. As an agent on an assigned prospect, confirm the status dropdown only offers
    Verified/Invalid/Called/Interested/Follow-up/Not Interested (not the Active Opportunity
    list), and that setting one of those succeeds. As admin, confirm a prospect's `address` and
    `osm_id` are visible on its detail page and that editing `address` (but not `osm_id`, which
    has no edit field) is possible.

## Manual test before enabling the daily cron (per your instructions)

Cron stays disabled through all of this. On `/admin/crm/opportunities`, check **Skip Hot-alert
email for this run**, click **Run Collection Now**, and confirm:

1. **Exact sources used** - the "By Source" list in the Collection Run panel (CanadaBuys, BC
   Bid, any configured municipal portals, and OpenStreetMap/Overpass).
2. **Accepted and rejected counts** - `candidatesFound`/accepted/`rejectedCount` in the panel,
   plus the New Active Opportunities / New Qualified Prospects split.
3. **At least 10 sample accepted records**, if available - open a handful from the table
   (mix of both categories if both produced results) and check their detail pages.
4. **Duplicates prevented** - run it a second time immediately after; confirm
   `newRecordsInserted` is 0 (or much lower) on the second run and `duplicatesAlreadyStored`
   accounts for the records the first run already added.
5. **No emails sent** - `hotAlertsSent` is 0, `hotAlertsSkipped` matches the Hot count found.
6. **No auto-assignment** - every newly-inserted record has `assigned_agent = null`.

Then stop and share the results for review before the `crons` entry is added to `vercel.json`.

## Deployment instructions

Migrations `0012`-`0016` are applied to the live Supabase project already; `0017` is pending
approval (see above). Once `0017` is applied:

1. Merge the PR / deploy the app itself to production (not yet done - still only on the PR's
   Vercel preview deployment as of this writing).
2. Set `CRON_SECRET` and (optionally) `OPPORTUNITY_ALERT_EMAIL` in Vercel.
3. Run the manual test above, share the results, and get sign-off before enabling the cron.
4. Only then add the `crons` entry to `vercel.json` and redeploy - see "Enabling the daily
   cron" above.

## What's intentionally not built yet

- Search-engine and social-post connectors (needs a paid search API).
- Automatic fuzzy-duplicate *detection* (the merge tool is manual/admin-initiated; the
  collection job's own dedup already prevents most true duplicates).
- The municipal-portal (bids&tenders/Biddingo) connector list ships empty pending
  verification of each municipality's real public URL.
- A combined admin view mixing leads and opportunities in one table - they're deliberately
  kept as separate CRM sections (separate list pages) since they have different field shapes,
  even though they now share the same activity/follow-up/audit mechanisms underneath.
- Property-management and office-building-management coverage for Qualified Prospects (no
  reliable OSM tag - see "Sources" above).
- A richer prospect data source with buying-signal text (news, reviews, job postings) - today's
  OSM-only connector will produce almost exclusively `Prospect`-tier (not `Warm`) records, since
  it has no free text to detect a buying signal from.
- A true historical daily digest for duplicates-skipped/rejected-records across *all*
  connectors (only available per-run, right after **Run Collection Now** - see "Daily Summary"
  above). The qualified-prospects connector specifically now has a persisted history via
  `opportunity_collection_runs`, but the tender connectors don't log a comparable row yet.
- Migration `0017` is written but **not yet applied to the live project** - pending your
  approval, same pattern as every prior schema change here.

## Sample records

**Active Opportunity:**

```json
{
  "lead_category": "Active Opportunity",
  "organization_name": "Riverside Medical Clinic",
  "opportunity_title": "Request for Proposal - Janitorial Services",
  "description": "The Riverside Medical Clinic is seeking proposals from qualified janitorial contractors for daily office and medical-space cleaning at its Surrey location...",
  "opportunity_type": "rfp_tender",
  "service_needed": "Medical office cleaning",
  "industry": null,
  "city": "Surrey",
  "province": "BC",
  "address": null,
  "osm_id": null,
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

**Qualified Prospect:**

```json
{
  "lead_category": "Qualified Prospect",
  "organization_name": "Fraser Valley Dental Centre",
  "opportunity_title": "Fraser Valley Dental Centre",
  "description": "Qualified prospect in the Dental office industry - a strong fit for commercial cleaning outreach based on its business category.",
  "opportunity_type": "qualified_prospect",
  "service_needed": null,
  "industry": "Dental office",
  "city": "Burnaby",
  "province": "BC",
  "address": "4720 Kingsway, Burnaby, BC, V5H 4J5",
  "osm_id": "node/123456789",
  "contact_name": null,
  "public_email": null,
  "public_phone": "+1-604-555-0142",
  "website": "https://fraservalleydentalcentre.example",
  "source_name": "OpenStreetMap (Overpass API)",
  "source_url": "https://www.openstreetmap.org/node/123456789",
  "date_posted": null,
  "deadline": null,
  "date_discovered": "2026-07-22T13:00:00.000Z",
  "intent_score": 35,
  "intent_level": "Prospect",
  "status": "Unverified Prospect",
  "assigned_agent": null,
  "notes": null,
  "next_follow_up_at": null,
  "last_contacted_at": null,
  "archived_at": null,
  "matched_cleaning_terms": [],
  "accepted_reason": "Dental office business with a confirmed Burnaby address and a public phone number - fits the commercial-cleaning target profile."
}
```

(`intent_score` here: 20 base + 5 confirmed city + 5 phone-only [no email] + 5 website = 35,
`Prospect` tier. The non-signal bonuses (city/contact/website) are capped so they can never add
up past 40 on their own - a record only ever reaches `Warm` when
`hasBuyingSignal()` detects an actual buying signal [+25] in its description, per the brief's
"Warm requires a strong public buying signal" definition. Today's OSM-sourced connector has no
free text to detect a signal from, so it will produce `Prospect`-tier records almost every
time - see "Intent scoring" above.)
