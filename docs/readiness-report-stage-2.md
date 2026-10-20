# Readiness report, stage 2 - backup, restore and security (2026-10-20)

Nothing here has been applied to production, merged, deployed or scheduled. Labels: **Verified** (checked
directly), **Inferred**, **Not checked**.

## 1. Private backup repository

- **Not created by me: GitHub refused (403, "Resource not accessible by integration").** This session's GitHub
  connection is allowed to work inside existing repositories but not to create new ones.
- **Ready to push:** the complete contents are staged in a local git repository (2 commits) and zipped:
  `/tmp/claude-0/-home-user-winsalot-funding/1d3b913c-b6c4-5836-8070-e1b35c934be4/scratchpad/winsalot-db-backups.zip`.
  It contains scripts, the runbook, an inactive workflow and a secret-scan workflow, and **no dumps, keys or
  credentials** (checked).
- **To finish (about 2 minutes, yours):** GitHub -> New repository -> name `winsalot-db-backups` -> **Private** ->
  create it **empty** (no README) -> grant the Claude GitHub App access to it
  (https://github.com/apps/claude/installations/select_target). Tell me, and I will attach it and push the staged
  commits. Alternatively unzip and push it yourself.

## 2. Can the production database be backed up securely? (Verified, read-only)

- **There is one production database, not two.** Both CRMs (Growth and Lead Generation) use the Supabase project
  `Business Finance`. The other project, `learnwithnev`, belongs to a different app and is not covered.
- Size 48 MB (public 23 MB, auth 1.8 MB), Postgres 17.6, 199 public tables with row security on all of them, no
  large objects, no replication slots, 1 storage bucket with 0 files, 6 Vault secrets (deliberately excluded).
- The database login has read access to every schema the backup needs (public, auth, storage, private).
- GitHub runners are IPv4-only; the free Supabase **session pooler** is IPv4 and supports `pg_dump`
  (confirmed in Supabase's documentation) - no paid add-on needed.
- Supabase's own WAL archiving is healthy (about 19.4k files archived, 0 failures, last one minutes old). This is
  indirect evidence; the Backups tab itself could not be read.
- **Not checked:** a real dump through the pooler (needs the database password, which I do not have and will not
  ask for in chat), real run time and file size.

## 3. Encryption, retention and restricted access

Design (details in `docs/backup-and-restore.md` and the private repo's runbook):
- Encrypted with `age` to a public key before leaving the runner; the private key stays offline with you. A private
  key pasted into the wrong place is rejected. Logs show sizes and counts only.
- Retention: Supabase 7 daily backups + 30 days of nightly encrypted artifacts (GitHub's maximum is 90) + an
  optional monthly keepsake you store yourself.
- Access: private repository, you as the only collaborator, 2FA, read-only database login (recommended, needs your
  approval), `contents: read` workflow, secret scanning blocks dumps/keys/connection strings from being committed.
- **Where credentials live (your choice):** Mode A stores two values in GitHub's *encrypted secret store* (never in
  files or logs); Mode B keeps **nothing** in GitHub - you run `backup.sh` yourself on a trusted computer.
- New safeguards added: the backup **fails** if any of 23 business-critical tables is missing; row counts are
  recorded before and after the dump so a live database does not cause false failures.

## 4. Backup and restore verified in an isolated environment (Verified)

A throwaway local Postgres, never connected to Supabase:
- Rebuilt the **real schema** from all 245 repository migrations: 199 tables (production: 199), 406 policies (408),
  110 functions (112), 598 indexes (596), 96 triggers (97). The small differences are objects created in the
  Supabase dashboard rather than in migrations.
- Filled it with clearly fake rows, including leads, appointments, call logs, agent assignments, client campaigns,
  payroll and lending records.
- Encrypted backup -> restore into a second empty database: 0 restore errors, every row count inside the recorded
  window, and **identical content hashes** for 22 critical tables, all 406 policies, function code, function and
  table permissions and login emails. Wrong key, tampered file, missing critical table, private key as recipient and
  unsafe restore target were all rejected.
- Encrypted size for the fake data was 1.5 MB; production is expected to be a few MB (estimate).
- Repeatable in one command: `scripts/backup/rehearsal/run-security-rehearsal.sh` (about 10 seconds).
- **Not checked:** the real pooler connection, the GitHub-hosted run, and a restore into a Supabase-flavoured image.

## 5. Are existing records protected?

Production data was only ever **read** (counts and structure), never changed. Today's counts, which the backup's
manifest will track: leads 70 + 13 + 62 + 6,193 call-list leads; appointments 11 + 22; call logs 1,649 + 2,204 + 7
Dialpad; agent assignments 11 + 59 + 3; client campaigns 16 campaigns, 6 + 6 clients, 74 call lists; payroll 4 + 9
payroll records, 38 + 107 attendance; lending partners 15; logins 11. Until the nightly backup is active, protection
is Supabase's daily backups (unverified in the dashboard) with up to 24 hours of exposure.

## 6. Outstanding security findings and which need your approval

| # | Finding | Status | Needs your approval |
|---|---|---|---|
| 1 | 11 functions callable by anon / signed-in users that should be server-only (claim jobs readable by anyone with the public key; invoice counter; triggers) | Fix prepared and tested (round 1) | **Yes - apply to production** |
| 2 | 3 RLS helper functions anon can call; 21 policies on PUBLIC | Fix prepared and tested (phase 2 draft) | **Yes - apply after round 1** |
| 3 | 23 other SECURITY DEFINER functions callable by any signed-in user (mostly legitimate policy helpers; some take a user id so any user could look up another user's role) | Reviewed, not prepared | **Yes - decide scope first** |
| 4 | Future functions are automatically callable by anon (Supabase default grants) | Not prepared | **Yes** (small change) |
| 5 | 3 functions with a mutable search_path | Not prepared | **Yes** (tiny, low risk) |
| 6 | Leaked-password protection is off | Dashboard toggle (Auth settings) | **Yes** - affects new/changed passwords only |
| 7 | Vercel **preview** deployments of any branch use the production Supabase URL and service-role key | Found this session | **Yes** - Vercel setting; options: remove the key from Preview, disable previews, or a separate test Supabase project (about $10-15/month) |
| 8 | The GitHub repository is public (code and PR text describing weaknesses are visible) | Backup is moved to a private repo | **Yes - whether to make it private** |
| 9 | 14 tables with row security on but no policy | Intentional (server-only tables) | No - informational |
| 10 | Auth uses a fixed connection count; 1,294 anon table grants protected only by row security | Dashboard / defense-in-depth | Optional |

## 7. Are the live CRMs operating normally? (Verified, read-only)

- Both Vercel **production** deployments are `READY` on commit `581b194`, the same as before this work.
- Supabase is `ACTIVE_HEALTHY`: 0 server errors in the last two hours; 15 database connections; uptime 107 days;
  latest applied migration `20261013190000` (none of mine); still 14 anon-callable SECURITY DEFINER functions,
  proving no change has been made.
- Existing unrelated warnings: `NEXT_PUBLIC_SITE_URL` points at the retired cleaning domain (ignored by the
  app); `WINSALOT_BOOKING_URL` is unset on `winsalot-funding`; occasional weather-widget 503.

## 8. Costs

| Item | Cost |
|---|---|
| Private GitHub repository, Actions, 30-day artifacts | **$0** on GitHub Free (2,000 min/month; this uses about 60-90; 500 MB storage, expected a few MB x 30) |
| Supabase: session pooler, `pg_dump`, daily backups | **$0** (already in Pro) |
| PITR, IPv4 add-on, compute upgrade | **Not needed; not proposed** (PITR would be about $100/month plus compute) |
| GitHub Pro/Team (branch protection on private repos) | Not needed ($4+/user/month if you ever want it) |
| Separate Supabase project for previews/testing (finding 7, optional) | About $10-15/month - your decision |

## 9. Approval checklist (nothing happens without it)

1. Create the empty private repository and grant access (or unzip and push yourself).
2. Choose credential mode A or B; add the secrets (Mode A) as described in the runbook.
3. Approve a manual test backup, then a restore test on your machine; only then the schedule.
4. Approve applying security round 1, then phase 2 (separately), in a quiet window.
5. Decide findings 3-8.
6. Merging PR 475 and anything touching PR 476 remain yours.
