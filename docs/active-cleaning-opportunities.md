# Active Cleaning Opportunities

A lead-generation system that scans **public, no-login** sources for businesses and
organizations in Metro Vancouver/the Lower Mainland (BC) and the Greater Toronto Area (ON)
showing recent intent to buy commercial cleaning, janitorial, custodial, or
building-maintenance services. It's additive to the existing app — a new Supabase table, a
new admin dashboard section, and a new (currently disabled) daily cron job — and doesn't
touch the quote system or CRM.

Every record is a **potential opportunity** surfaced from a public source, never a confirmed
buyer. The dashboard, the alert email, and this doc all describe them that way deliberately.

## How it works

1. A daily collection job (`src/lib/opportunities/run.ts`) runs each **connector** —
   one per public source — and collects candidate opportunities.
2. Candidates are deduped (against each other and against what's already stored), scored
   0–100 with an intent level (Hot/Warm/Research), and the genuinely new ones are inserted
   into `active_cleaning_opportunities`.
3. Any newly-inserted **Hot** opportunity triggers an email alert to
   `info@winsalotcorp.com` (override with `OPPORTUNITY_ALERT_EMAIL`).
4. Admins work opportunities from **`/admin/opportunities`**: filter, assign to an agent,
   log notes, and move status through the pipeline — through to eventually being handed off
   into the CRM (`assigned_agent` references `crm_users`, the same table CRM agents live in;
   there's no automatic conversion into a `crm_leads` row yet — see "What's intentionally not
   built" below).

## Compliance approach

- **robots.txt is enforced at runtime**, not just checked by hand once — every connector
  that fetches an HTML page calls `isAllowedByRobots()` (`src/lib/opportunities/robots.ts`)
  first, and fails closed (skips that source for the run) if robots.txt can't be confirmed
  to allow it. The one exception is the CanadaBuys connector, which reads a published
  open-data CSV file meant for bulk consumption, not a crawled page.
- No login, CAPTCHA-bypass, or paywall access anywhere in any connector.
- Every record stores its `source_url`, `source_name`, and `date_discovered`.
- No private groups/profiles or sensitive personal data are ever collected — only
  organization-level public contact info (a listed business email/phone), same as what
  you'd see on a public tender notice.

## Phase 1 sources (connectors)

Each source is an isolated connector (`src/lib/opportunities/connectors/`) — a broken or
unreachable one is caught and logged, never blocks the others:

| Connector | Source | Status |
| --- | --- | --- |
| `canadabuys.ts` | [CanadaBuys open-data tender feed](https://open.canada.ca/data/en/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2) (Government of Canada, Open Government Licence, updated every 2 hours) | Live — flagship Phase 1 source |
| `bcbid.ts` | [BC Bid](https://bcbid.gov.bc.ca/page.aspx/en/rfp/request_browse_public) public opportunity browse page | Live, best-effort HTML parse — **needs a live smoke test after first deploy** (see below) |
| `bidsandtenders.ts` / `municipal-portal.ts` | Per-municipality public tender portals (bids&tenders, Biddingo, etc. — most GTA municipalities use one of these) | **Ships with an empty config list** — see "Activating municipal portals" below |

General search-engine results (Google/Bing) and public social posts (Reddit, etc.) are
explicitly **out of scope for Phase 1** — scraping raw search-engine result pages violates
their terms, and a compliant path needs a paid API (Google Programmable Search / Bing Web
Search, or the official Reddit API). Add these as new connectors later if you want to budget
for one.

### Why this sandbox couldn't fully verify BC Bid/municipal portals

The environment this feature was built in has no outbound network access to the public
internet (only to a small allowlist), so the BC Bid and municipal-portal HTML selectors
(`src/lib/opportunities/html-scrape.ts`) were written against publicly documented page
structure and general bid-listing table conventions, not a live fetch of the actual page.
They're intentionally tolerant (row-based text/link extraction rather than brittle CSS
selectors) and fail safe (empty result + logged error, never a thrown exception) if the
real markup doesn't match — but you should trigger **Run Collection Now** on
`/admin/opportunities` after deploying and confirm BC Bid actually returns candidates before
relying on it.

### Activating municipal portals (bids&tenders/Biddingo)

`src/lib/opportunities/connectors/bidsandtenders.ts` exports `MUNICIPAL_PORTALS: []` on
purpose — guessing municipal subdomains and shipping them as if verified would risk hitting
the wrong host. To add one:

1. Visit the target municipality's own procurement/tenders page and find its public
   bid-listing URL (must be reachable with no login).
2. Confirm it's not disallowed by that site's `robots.txt` (the runtime check in
   `robots.ts` also enforces this automatically, but it's worth a manual look first).
3. Add an entry to `MUNICIPAL_PORTALS`:
   ```ts
   { sourceName: "City of Mississauga Tenders", listingUrl: "https://...", city: "Mississauga", province: "ON" }
   ```
4. Redeploy and run **Run Collection Now** to confirm it returns candidates.

## Intent scoring

`src/lib/opportunities/scoring.ts` implements the brief's scoring table exactly:

- RFP/tender: +50, quote/proposal request: +40, new-location signal: +15, hiring-signal
  only: +5 (base, by `opportunity_type`)
- Deadline within 30 days: +20
- BC (Metro Vancouver/Lower Mainland) location: +15
- Public email or phone available: +10
- Posted within the last 14 days: +15
- Posted more than 60 days ago: −25
- Score clamped to 0–100; **70–100 = Hot, 40–69 = Warm, 0–39 = Research**
- A record whose deadline has already passed is stored with `status = 'Expired'` instead of
  `'New'` from the moment it's discovered, and the daily job also sweeps any existing
  non-terminal record whose deadline has since passed to `'Expired'`.

## Deduplication

`src/lib/opportunities/dedupe.ts` treats two candidates as the same opportunity if they
share a source URL + title, or if they share organization + title + deadline (catches the
same tender re-published on a mirror/tracking-param URL). This runs twice: once across a
single run's own candidates, and once against what's already in the database (via two
`.in()` queries on `source_url`/`opportunity_title` — not a hand-built filter string, so
scraped titles/URLs can't corrupt the query). A record already in the database is never
touched by a later run, so an admin's status/notes/assignment work is never overwritten by
re-discovery.

## Database

New migration: [`0012_active_cleaning_opportunities.sql`](../supabase/migrations/0012_active_cleaning_opportunities.sql).
Purely additive. `active_cleaning_opportunities` has RLS enabled with a single admin-only
policy (`crm_user_role(auth.uid()) = 'admin'`), the same shape as `crm_leads_admin_all` —
there's no agent-facing policy yet; `assigned_agent` is a plain FK to `crm_users` for
tracking/handoff, not a visibility gate, until a later phase decides agents should see their
assigned opportunities directly (mirroring how `crm_leads` scopes agents today would be the
natural next step).

The collection job writes via the service-role client (`src/lib/supabase-admin.ts`), the
same pattern already used for public `quote_requests` writes — it has no user session to
authenticate as, so it bypasses RLS entirely rather than using it.

## Environment variables

Added to `.env.example`:

- `CRON_SECRET` — shared secret the cron route requires as `Authorization: Bearer <value>`.
- `OPPORTUNITY_ALERT_EMAIL` — mailbox for the Hot-opportunity alert (defaults to
  `info@winsalotcorp.com`).

Reuses existing vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `EMAIL_FROM`.

## Enabling the daily cron

**Deliberately left disabled for now** — `vercel.json` has no `crons` entry, so nothing runs
on a schedule yet. `GET /api/cron/cleaning-opportunities` (with the `CRON_SECRET` bearer
header) works today for manual testing; it just isn't scheduled.

To turn it on once you're happy with what Phase 1 finds:

1. Set `CRON_SECRET` in Vercel (Project Settings → Environment Variables) to a random
   secret.
2. Add to `vercel.json`:
   ```json
   {
     "crons": [{ "path": "/api/cron/cleaning-opportunities", "schedule": "0 13 * * *" }]
   }
   ```
   (`0 13 * * *` = 1pm UTC = 6am/9am Pacific/Eastern depending on DST — adjust to when you
   want the daily run.) Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on
   every invocation once `CRON_SECRET` is set, so no further wiring is needed.
3. Redeploy.

## Testing instructions

1. Apply the migration (see below), then confirm `active_cleaning_opportunities` exists in
   Supabase with RLS enabled and the one admin policy.
2. Set `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` (or rely on existing defaults) locally
   or on a Preview deployment.
3. Sign in at `/admin/login`, visit `/admin/opportunities`, click **Run Collection Now**.
   Confirm it reports candidates found/inserted without error.
4. Confirm new rows appear in the table with a correct intent score/level, and that the
   summary cards (New/Hot/Warm/Expiring Soon/Assigned) match what's shown.
5. Expand a row: confirm **Open Original Source** opens the real source URL, **Assign to
   Agent** and the **Status** dropdown persist after a page refresh, **Add Note** appends a
   timestamped entry, and the three quick-action buttons (Mark Contacted/Converted/Not
   Suitable) update status.
6. Test every filter (city, region, province, opportunity type, intent level, status, agent,
   deadline, discovery date) narrows the table correctly.
7. Manually call `GET /api/cron/cleaning-opportunities` with a wrong/missing bearer token —
   confirm 401. With the correct token — confirm it runs and returns a JSON summary.
8. Insert a duplicate-looking record (same source URL/title) via a second **Run Collection
   Now** and confirm no duplicate row appears and no second alert email is sent.
9. Confirm `/commercial-cleaning-quote`, `/admin` (quote dashboard), `/admin/crm`, and
   `/agent/*` are all unaffected.

## Deployment instructions

1. Apply `supabase/migrations/0012_active_cleaning_opportunities.sql` to your Supabase
   project (via the Supabase CLI/dashboard SQL editor, or `mcp__Supabase__apply_migration`
   if using an MCP-connected session).
2. Set `CRON_SECRET` and (optionally) `OPPORTUNITY_ALERT_EMAIL` in Vercel's environment
   variables.
3. Deploy. `/admin/opportunities` is live immediately (admin-only, same gate as the rest of
   `/admin`); the cron stays off until you add the `vercel.json` entry above.
4. Run **Run Collection Now** from the dashboard once in production to seed real data and
   confirm the connectors work against the live network (this sandbox couldn't verify BC Bid
   against a live fetch — see above).

## What's intentionally not built yet

- Search-engine and social-post connectors (Phase 2, needs a paid search API — see "Phase 1
  sources" above).
- Automatic conversion of a `Converted` opportunity into a `crm_leads` row — `assigned_agent`
  is in place for a human handoff today; wiring an explicit "Send to CRM" action is a natural
  follow-up once Phase 1's data quality is validated.
- Agent-level visibility/RLS on `active_cleaning_opportunities` (admin-only for now, per the
  brief's dashboard being an "admin dashboard").
- The municipal-portal (bids&tenders/Biddingo) connector list ships empty pending
  verification of each municipality's real public URL, per the compliance rules — see
  "Activating municipal portals" above.

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
  "notes": null
}
```

(`intent_score` here: 50 rfp_tender + 20 deadline-within-30-days [13 days out] + 15 BC
location + 10 public email + 15 posted-within-14-days [8 days old] = 110, clamped to 100.)
