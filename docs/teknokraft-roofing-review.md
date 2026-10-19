# Goodness — Teknokraft Toronto / GTA Roofing

Status: proposed implementation. No production data change, merge or deployment authorized.

Goodness gets an additional campaign assignment; her existing assignments, primary client,
leads, call logs, appointments, attendance, payroll and incentive history stay intact.
The existing campaign / list roster tables and session-scoped RLS remain the access model.

## Review the application

- Agent dashboard: **Switch client / campaign**, or **Campaign Workspace** in navigation.
- `/leadgen/agent/campaigns?campaign=<id>` shows only the selected authorized campaign.
  The empty selection combines the agent's authorized campaigns. This does not change the
  administrator-selected primary client or write a default to Goodness's account.
- `/leadgen/admin/campaign-workspace` provides a combined administrator report or an
  individual campaign selection. Counts page through all rows, avoiding the 1,000-row cap.
- Workspace includes assigned prospects (unpromoted call-list records plus pipeline leads,
  without double-counting promotions), website categories, calls, distinct reached phone
  numbers, countable appointments, interested prospects and due follow-ups. Promoted leads
  use authoritative pipeline status and next follow-up, avoiding stale call-list callbacks.
- Agent call logging from the workspace binds client/campaign on the server. The ordinary
  Call Log now requires a valid assigned campaign belonging to the selected client.
  Call-list logging continues deriving attribution from the list. Successful saves invalidate
  the agent layout and administrator campaign report so history and totals refresh.
- Appointments derive their campaign from the authorized lead and reject mismatched client,
  campaign or another agent's lead. Contact, date, phone, email and service-interest notes
  remain on the normal appointment record and appear in the administrator workspace.
- Promotion lookup is scoped to the campaign so a prospect in a different campaign cannot
  silently become the appointment target.
- Attendance, Dialpad and payroll stay on their existing global screens; a campaign selection
  does not change compensation calculations. Legacy campaign-less activity remains available
  in existing history screens; it is not guessed into a campaign.

## Source and isolated import results

The requested LeadSwift file was already committed in this repository:

`campaign-125683-search-929990-roofing-contractor_toronto-on-canada_6114fd364665ee161e390e1a563d0e97.csv`

SHA-256: `4720789fb6fca01b2e76b5a8335795c9fa4576d49635e451eeed288e9aac763b`

An isolated Postgres test of all 1,867 rows produced:

| Result | Rows |
| --- | ---: |
| Prospecting: supplied website / rebranding opportunity | 338 |
| Prospecting: website verification needed | 234 |
| Admin review: supplied website | 343 |
| Admin review: website verification needed | 903 |
| Duplicate rows skipped | 49 |
| Verified without a website | 0 |

These are **isolated test counts**, not production import counts. Existing Teknokraft
records can result in further duplicate skips. No websites were fetched or audited.
A supplied business website indicates potential redesign / mobile / SEO / rebranding /
conversion services, not a proven website problem. Blank, directory, social-only or invalid
URLs require verification. Only an explicit `extra_fields.website_verification` value of
`verified_no_website`, with no supplied website, counts as a new-website opportunity.
No missing contact details are invented. Full source columns are retained as extra fields.

Rows with unverified roofing fit, Toronto/GTA address, or dialable phone stay in an
unassigned **draft Admin Review** list. Ready rows are split into named active lists and
assigned only to Goodness. The CSV contains a stray quote in an unquoted category field;
the existing parser now preserves literal quotes in unquoted fields instead of merging rows.

## After approval only: apply the assignment and import

Run the offline generator with Node 24+ from the repository root:

```bash
node scripts/prepare-teknokraft-roofing.mjs \
  campaign-125683-search-929990-roofing-contractor_toronto-on-canada_6114fd364665ee161e390e1a563d0e97.csv \
  /tmp/teknokraft-roofing.sql
```

Inspect the generated SQL and run it against the approved Lead CRM database using an
administrator connection, only after explicit approval. It is deliberately outside automatic
migrations. The transaction aborts if Teknokraft / Goodness / administrator identity is
missing or ambiguous, Goodness has no existing other-client assignment, or existing roofing
lists/campaigns conflict. It never changes the primary campaign, existing records or history.

The import uses an advisory transaction lock and deduplicates against **all Teknokraft
campaigns**, including existing pipeline and removed call-list rows, by source row, normalized
phone, email, domain, or business name plus location. Conservative shared identifiers may
skip related businesses; the row-level output identifies matches for administrator review.
Rows with confirmed industry/location/phone are processed first. Re-running the same import
inserts no duplicate prospects. DNC matches are flagged using the existing shared suppression
records. Capture both result sets (bucket counts and per-source-row audit) from execution.

Then verify Goodness can open both accounts, save a roofing call, promote a prospect and book
an appointment under Teknokraft; check the administrator view and unchanged existing campaign.
Recheck actual database RLS and compare live before/after snapshots at execution. Live schema
and signed-in browser verification have not been performed in this review-only work.

## Validation

- 569 relevant regression tests passed across 60 files, including campaign switching,
  unauthorized selections, write attribution, campaign/client mismatch, appointment data,
  existing lead visibility and campaign assignment behavior.
- Four import tests passed, including an actual 1,867-row import and rerun in isolated PGlite
  Postgres, fixture preservation, missing values, DNC and database/in-file deduplication.
- TypeScript check, targeted ESLint and production build passed locally.
- React review: session-scoped server reads, authenticated server actions, labeled controls,
  campaign-keyed call form, parallel independent reads and no added dependencies.
- Vercel automatic Git deployments are disabled specifically for this PR branch in
  `vercel.json`; other branches are unaffected. No release or live SQL was run.
