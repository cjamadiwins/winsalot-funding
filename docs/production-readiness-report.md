# Production-readiness report - PR 475 (backup + security) and PR 476 (performance)

Prepared 2026-10-20. Nothing in this report has been merged, deployed, applied to production or
activated. Facts below are labelled **Verified** (checked directly), **Inferred**, or **Not checked**.

## Verdict

| Item | Safe to approve? |
|---|---|
| Security round 1 SQL (`supabase/pending-approval/20261020120000_...`) | **Yes, for a production apply after your separate go-ahead.** Narrow, reversible, self-checking, and no CRM feature depends on what it removes. Apply it soon: the repo is public (see below). |
| Backup tooling (scripts, docs, workflow) | **Yes to merge the files as inactive tooling. Do NOT activate in this repository.** It must run from a private repository (the workflow now refuses to run in a public one). |
| Performance PR 476 | **Not yet.** Hold until the security SQL is applied and monitored. Commit 1 (skip the Auth lookup for Server Actions) is low risk; commits 2-4 are product decisions. Never deployed anywhere beyond preview builds. |

## 1. Are both CRMs operational? (Verified)

- Supabase project `Business Finance`: `ACTIVE_HEALTHY`; API requests in the last hour: 0 server errors
  (5xx), 18 client errors (4xx) out of about 1,100 requests (normal; same kinds as before).
- Both Vercel production deployments (`winsalot-funding` Growth CRM and `winsalot-leadgen-crm`) are `READY`
  and still serve commit `581b194` from `main`, deployed before any of this work. Nothing of mine is in
  production.
- Preview deployments for both PRs built successfully on both projects. Unauthenticated requests to the
  perf preview behave correctly: `/agent/dashboard` redirected to `/agent/login?redirectTo=/agent/dashboard`,
  and the Lead Gen login page renders on the security preview. (No real login was attempted.)
- Existing runtime warnings, unrelated to this work: `NEXT_PUBLIC_SITE_URL` on `winsalot-funding` points at the
  retired `cleaning.winsalotcorp.com` (the app ignores it); `WINSALOT_BOOKING_URL` is not set on
  `winsalot-funding` (a safe default is used). Occasional Open-Meteo 503 on the weather widget.
- The production database still has the original function grants (re-read just now), i.e. the
  vulnerability described below is still open in production.

## 2. Backup and restore documentation review

Reviewed end to end and corrected. Changes made during this review:
- **New finding: the repository is public.** Artifacts of a public repository can be downloaded by anyone
  signed in to GitHub, so "private artifacts" would not have been private. Fix: the workflow now has a
  hard guard (`github.repository_visibility`) and refuses to run in a public repository; the doc tells you
  to create a small private repository (`winsalot-db-backups`), copy three files into it, and run it there.
- Added the exact secret table, step-by-step setup, the IPv4 explanation (GitHub Actions is IPv4-only, the
  direct database address is IPv6-only, the shared session pooler is IPv4 and free), a safer read-only
  database-login option (needs your separate approval), and a clear list of what was and was not tested.
- Verified against Supabase's documentation: Pro keeps 7 daily backups; session-pooler string format
  `postgres.<project-ref>@aws-...pooler.supabase.com:5432`; GitHub Actions needs the pooler or the paid
  IPv4 add-on.
- Verified by rehearsal (`scripts/backup/test-local.sh`, offline, synthetic data): backup, encryption,
  restore, comparison PASS; a private key as recipient, missing secrets, a wrong key, a tampered file and
  an unsafe restore target are all rejected; output contains no plaintext.
- **Not tested:** a real run through the pooler against the live database, run time and file size, and
  restore into a plain Postgres 17 image (needs Docker, not available in my environment).

## 3. Will the security SQL affect agents, clients, appointments, call logs or payroll? (Verified)

Live production catalog checks (read-only), then 16 rehearsal tests:

| Area | Depends on a revoked function? | Evidence |
|---|---|---|
| Agent access / logins / permissions | No | No row-level-security policy, view, rule, column default, cron job or other function references any of the 11 functions. The 3 functions that policies do use are deferred and untouched. |
| Call logs (`crm_call_logs`, `leadgen_call_logs`, `call_list_leads`) | No | No trigger or default on these tables uses a revoked function. |
| Payroll, attendance, holiday pay (all payroll tables) | No | Same check. The existing payroll migration tests (part of the 1,514-test suite) pass. |
| Lending partners / referrals | No | Same check. |
| Client records | Yes, one trigger | `crm_clients` archive trigger (cancels retention emails). Triggers do not need EXECUTE to fire; rehearsal shows an authenticated user archiving a client still cancels retention. |
| Appointments | Yes, one trigger | `leadgen_appointments` insert trigger (creates the conversion record). Rehearsal: still fires. |
| Chat / announcements | Yes, triggers | 9 chat tables (edit/soft-delete rules, conversation touch). Rehearsal: still fire and still enforce their rules. |
| Marketing / retention jobs | Yes, server only | Called only by `crm-marketing-job.ts` and `crm-retention-job.ts` through the service-role client, which keeps access (test enforces this). |
| Provider invoices | Yes, column default | `provider_invoices.invoice_number`. Signed-in users and the server keep access; only anonymous callers lose it. |
| New tables getting row security automatically | Yes, event trigger | Rehearsal: still fires. |

Other checks: 0 Supabase Edge Functions exist; the last 24 hours of API logs show only the three claim
functions being called through the API (26 calls, consistent with the server jobs); the migration also
contains a self-check that aborts and rolls back if any intended grant is wrong.

**Limits of this evidence (Not checked):** it has not been run against a copy of real production data (no
backup exists yet to build one), and rehearsal uses rebuilt stand-ins of the 11 functions and their tables.
Log evidence covers 24 hours only. Rollback is one script that restores the exact prior grants (also tested).

### Important: why to apply it soon
The repository is public and the three claim functions can be run with the public anon key (which the apps
ship to browsers). Anyone who reads the public migrations could call them today and read marketing /
retention enrollment rows or block scheduled sends. This was already the case before my work; my PR text
now also describes it. I recommend applying the SQL promptly after your approval.

## 4. Does the backup workflow need any paid service? (Verified/Inferred)

No. In a **private** repository on GitHub Free: 2,000 Actions minutes/month (this uses about 60-90) and
500 MB of artifact storage (expected a few MB per dump x 30; an estimate until the first real run). Supabase:
the shared session pooler and `pg_dump` are free; no IPv4 add-on, PITR or compute change. `age` and the
PostgreSQL client are free. Confirm your GitHub plan under Billing. If you made `winsalot-funding` itself
private instead, the same limits would apply to it.

## 5. Which GitHub secrets, exactly

In the **private backup repository** (not this one): two repository **secrets**.

1. `SUPABASE_DB_URL` - Supabase -> Business Finance -> Connect -> **Session pooler** string, with your
   database password filled in by you.
2. `BACKUP_AGE_PUBLIC_KEY` - the `age1...` public key printed by `age-keygen` on your own computer. The
   private key stays offline and is never added anywhere.

Full step-by-step instructions are in `docs/backup-and-restore.md` ("The two GitHub secrets"). The
repository variable `BACKUP_ENABLED` must stay unset until a manual run and a restore test have passed.

## 6. PR 476 (performance) readiness

- Verified: `next build` succeeds; 1,517 tests pass; preview deployments built on both projects; proxy
  behaviour covered by 14 tests (including the revoked-session redirect-loop case).
- Not tested: real sign-in and session refresh against Supabase (no credentials used), and real request counts
  after deploy. The estimate (about 15-20% fewer requests from commits 1-3) is unmeasured.
- Decisions that are yours: attendance check-in 30 s -> 60 s, script heartbeat 60 s -> 90 s, local token
  check (only helps if Supabase JWT signing keys are asymmetric - check Project Settings -> JWT Keys).
- Recommendation: after the security SQL is applied and quiet for a few days, deploy commit 1 alone first,
  compare the request-count query in `docs/performance-optimization-plan.md`, then decide on the rest.

## 7. What needs your explicit approval (nothing happens without it)

1. Apply the security SQL to production (and when).
2. Create the private backup repository, add the two secrets, run the manual test, then enable the schedule.
3. The optional read-only backup database login.
4. Merging PR 475 (tooling and SQL files only; the SQL stays in `supabase/pending-approval/` until you move it).
5. Each performance commit, and deploying PR 476.
6. Whether to make `winsalot-funding` private.
