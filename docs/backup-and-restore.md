# Database backup and restore (Business Finance Supabase project)

Two layers protect the database:

1. **Supabase daily backups** (Pro plan, 7-day retention, restore from the dashboard).
2. **Encrypted nightly off-site backup** (this document): `scripts/backup/backup.sh`, run by a GitHub
   Actions workflow, stored as an encrypted artifact for 30 days.

Nothing here enables PITR or any paid Supabase or GitHub feature.

> **Status: inactive by design.** The workflow can only run manually, its schedule is commented out,
> scheduled runs also need the repository variable `BACKUP_ENABLED=true`, and it **refuses to run in a
> public repository** (see next section). Do not unlock any of this until every step in "Activation
> checklist" is done.

## Where it must run: a PRIVATE repository, not this one

`cjamadiwins/winsalot-funding` is a **public** repository. In a public repository anyone signed in to
GitHub can download workflow artifacts, so 30 days of copies of your whole database (even encrypted)
would be publicly downloadable. Encryption protects them today, but you would be relying on one key
forever: if the private key ever leaked, every copy could be opened by anyone. A private repository
removes that risk. The workflow therefore has a hard guard (`github.repository_visibility`) and
fails with a clear message if it is run in a public repository.

Set it up like this (about 10 minutes, free):

1. GitHub -> **New repository** -> name it e.g. `winsalot-db-backups` -> **Private** -> create it empty.
2. Copy exactly these into the new repository (keeping the paths):
   `scripts/backup/backup.sh`, `scripts/backup/verify-restore.sh`, `.github/workflows/nightly-db-backup.yml`.
   Reviewing and copying the files (instead of fetching them from the public repository at run time)
   means nobody can change the code that handles your secrets by editing the public repository.
3. Add the secrets and run it **there** (below). Keep write access to that repository limited to you.

(Alternative: make `winsalot-funding` itself private. That is a larger decision - it also affects who
can see the application code and how Vercel connects - so it is not assumed here.)

## What is (and is not) in a backup

| Included | Excluded |
|---|---|
| `public` (all CRM, call-log, appointment, payroll, lending, campaign tables, RLS policies, functions, triggers, grants) | `vault` (the 6 encrypted Vault secrets - re-enter these from your own secret store after a rebuild) |
| `auth` (staff logins, including password hashes - this is why the file is encrypted) | Supabase-managed internals (`realtime`, `graphql`, `extensions`, `net`, `pgbouncer`) |
| `storage` metadata, `private` (reminder-cron functions), `supabase_migrations` | Storage *files* (the project has one bucket and 0 objects today) |
| A manifest of exact row counts per table and object counts, and the `pg_cron` job list | Custom database role passwords |

Everything is bundled and encrypted with [age](https://github.com/FiloSottile/age) before it is
written anywhere. The plaintext exists only in a temporary directory that is deleted when the job
ends. Logs contain sizes, counts and timestamps only.

## Key management (decide this before touching GitHub)

Backups are encrypted to an **age public key**. Only the matching **private key** can open them.

- Generate the key pair **on your own computer**, not in GitHub or any cloud tool:
  `age-keygen -o winsalot-backup-key.txt`. It prints the public key (`age1...`) to the terminal; the
  file holds the private key (`AGE-SECRET-KEY-...`).
- **The private key never goes into GitHub, any repository, chat, or email.** Put it in your password
  manager *and* a second offline location (for example a printed copy in a safe). Losing it means every
  backup is unrecoverable; leaking it means every backup can be read.
- Only the **public** key (`age1...`) is stored in GitHub. `backup.sh` refuses to run if that value is a
  private key.
- Optional second holder: put two public keys in the secret, separated by a comma. Either private key
  can then open every backup.
- Rotation: generate a new pair, update the secret, keep the old private key as long as old artifacts
  (30 days) exist.

## The two GitHub secrets (exactly)

| Secret name | What it contains | Where it comes from |
|---|---|---|
| `SUPABASE_DB_URL` | The **Session pooler** connection string, `postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres` | Supabase dashboard -> project *Business Finance* -> **Connect** -> **Session pooler** |
| `BACKUP_AGE_PUBLIC_KEY` | The age **public** key, one line starting `age1` (two keys comma-separated if you want a second holder) | Printed by `age-keygen` on your computer |

Why the session pooler: GitHub Actions runners are IPv4-only and the direct database address is IPv6-only
unless you buy Supabase's paid IPv4 add-on. The shared session pooler is IPv4, included on every project
at no extra cost, and supports `pg_dump`.

### Step by step

1. **Generate the key (your computer).** Install `age` (macOS `brew install age`; Windows
   `winget install FiloSottile.age`; Linux `apt install age`), then run
   `age-keygen -o winsalot-backup-key.txt`. Copy the line beginning `Public key: age1...` (only the
   `age1...` part). Store `winsalot-backup-key.txt` in your password manager and a second offline place.
2. **Get the connection string.** Supabase dashboard -> Business Finance -> **Connect** (top bar) ->
   method **Session pooler**. Copy the string. It contains the placeholder `[YOUR-PASSWORD]`.
3. **Put your database password in yourself**, in a private text editor - never in chat, email, an issue,
   or a document. If you do not know the database password, you can reset it at Project settings ->
   Database. Resetting briefly drops direct and pooled database connections; the two CRMs only use the
   Supabase API keys (their Vercel settings contain no database password), so they are not affected, but
   do it outside working hours. Avoid resetting if you already know the password.
4. **Add the secrets.** In the **private backup repository**: Settings -> Secrets and variables ->
   Actions -> **New repository secret**. Add `SUPABASE_DB_URL` (paste the finished string) and
   `BACKUP_AGE_PUBLIC_KEY` (paste the `age1...` line). Use *Secrets*, not *Variables*. GitHub masks secret
   values in logs and never shows them again after saving.
5. **Lock down the repository.** Settings -> Collaborators: only you. Settings -> Actions -> General ->
   leave "Fork pull request workflows" at the default (secrets are never passed to forks).
6. Do **not** set the `BACKUP_ENABLED` variable and do not uncomment the schedule yet.

### Recommended hardening (needs your separate approval - not part of this change, untested)

Instead of the `postgres` user, give the backup its own read-only database login so a leaked secret could
not change data. In the Supabase SQL editor, type your own new password where shown:
`create role backup_reader login password '<choose-a-strong-password>'; grant pg_read_all_data to backup_reader;`
and use `postgresql://backup_reader.<project-ref>:<that-password>@...` in `SUPABASE_DB_URL`. Because this
creates a production role, it must be approved and tested with a manual run before nightly use.

## Activation checklist

1. Private backup repository created and files copied (above).
2. Key pair generated offline, private key stored in two places.
3. The two secrets added.
4. Run the workflow **manually** (Actions -> Nightly database backup -> Run workflow). The job must be
   green and an artifact `winsalot-db-backup-<id>` must appear containing a `.tar.age` and `.sha256`. Note
   the file size.
5. Download it and run the **restore test on your own machine** (next section). It must print PASS.
6. Only then: set repository variable `BACKUP_ENABLED=true` **and** uncomment the `schedule:` block (a
   change you make or approve yourself).
7. Calendar a monthly restore test. GitHub emails you when a scheduled run fails; also glance at the
   Actions tab weekly for the first month.

## Restore test (safe, isolated, never touches production)

Needs Docker or any local Postgres 15+ and the `age` tool. The target must be an **empty scratch
database on your own computer**; the script refuses non-local or Supabase targets and refuses a database
that already has tables.

```bash
# 1. Throwaway Postgres (example with Docker; any local empty database works)
docker run --rm -d --name wl-restore-test -e POSTGRES_PASSWORD=scratch -p 54329:5432 postgres:17
createdb -h localhost -p 54329 -U postgres scratch      # password: scratch

# 2. Restore the downloaded artifact and compare to its manifest
RESTORE_DB_URL=postgresql://postgres:scratch@localhost:54329/scratch \
  scripts/backup/verify-restore.sh winsalot-db-<timestamp>.tar.age /path/to/winsalot-backup-key.txt

# 3. Clean up (also delete the downloaded files if you no longer need them)
docker stop wl-restore-test
```

PASS means every table row count and the structural counts (tables, RLS-enabled tables, policies,
functions, indexes, triggers) match what was recorded at backup time. A plain Postgres image lacks some
Supabase-only pieces, so a handful of `pg_restore` error headlines about missing roles/extensions can
appear; they are listed (names only, never row data) and do not affect the data comparison.

`scripts/backup/test-local.sh` rehearses the entire procedure offline on a small synthetic database (backup,
encryption, restore, comparison, missing-critical-table, wrong-key, tampered-file and unsafe-target checks).

The stronger rehearsal rebuilds the **full real schema** locally (all 245 repository migrations on a throwaway
Postgres with stand-ins for the Supabase-managed pieces: 199 tables, 406 row-security policies, 110 functions,
596 indexes, 96 triggers, close to production's 199 / 408 / 112 / 596 / 97), fills it with clearly fake rows
(`scripts/backup/rehearsal/`), then backs it up, restores it into a second empty database and compares. Result:
0 restore errors, every table count inside the recorded window, and identical content hashes for the 22
business-critical tables, all row-security policies, function code, function and table permissions and login
emails. `scripts/backup/rehearsal/run-security-rehearsal.sh` runs the whole thing in one command (about 10 seconds, entirely local), including applying and rolling back the pending security SQL on the restored copy. **Not yet exercised:** a real run against the live database through the pooler, and a restore into a
plain Postgres 17 image.

## Disaster recovery order of operations

1. **Prefer Supabase's own dashboard restore** (Database -> Backups) for a full in-place recovery - it
   restores everything including Vault and Realtime configuration. The project is offline while it runs.
2. Use the encrypted off-site backup when the project or its daily backups are unavailable, or to
   recover individual tables: decrypt, restore into a scratch database, then copy only the needed rows.
3. After rebuilding a project from the off-site backup: re-enter the 6 Vault secrets, re-create the
   `pg_cron` jobs from `cron-jobs.tsv` in the bundle, re-apply any grants from the dump, and re-point the
   Vercel environment variables.

## Cost and limits

- **Paid services needed: none.** Private-repository GitHub Actions includes 2,000 minutes/month on the
  Free plan (this job uses about 2-3 minutes a night, roughly 60-90 a month) and 500 MB of
  artifact/package storage. The shared session pooler and `pg_dump` cost nothing on Supabase. `age` and
  the PostgreSQL client are free packages. No Supabase IPv4 add-on, PITR, compute upgrade or Vercel
  change is involved.
- **Watch item:** artifact storage. The database is 48 MB; a compressed encrypted dump is expected to be
  a few MB, so 30 daily copies should fit well within 500 MB. That is an estimate - check the first run's
  size and multiply by 30. If you outgrow it, shorten retention rather than buying storage.
- Artifacts expire automatically after 30 days; storage accounting can lag by several hours.
- Confirm your GitHub plan and limits under GitHub -> Settings -> Billing and plans.

## Retention and access strategy

| Layer | Holds | Kept for | Who can open it |
|---|---|---|---|
| Supabase daily backups (Pro) | Whole project, restored in place from the dashboard | 7 days | Project owners in the Supabase dashboard |
| Nightly encrypted artifact (private repo) | Public + auth + storage metadata + private + migration history, plus a row-count manifest | 30 days, rolling (GitHub deletes expired artifacts automatically; 90 days is the maximum GitHub allows) | Only someone holding the offline age private key |
| Monthly keepsake (optional, manual) | One downloaded artifact per month, stored in your password manager's file storage or an encrypted drive | As long as you choose (suggest 12 months) | Same key, plus wherever you store the file |

Access restrictions: the backup repository is private with you as the only collaborator; two-factor authentication
on your GitHub account; Actions secrets can only be read by workflows in that repository; the database login in
`SUPABASE_DB_URL` should be the read-only role described above; the age private key is never online. Database
dumps and keys never go into git: the backup repository's `.gitignore` and its secret-scan workflow block
`*.age`, `*.pgdump`, key files and connection strings.

## Credentials: where they live (choose one)

- **Mode A - GitHub encrypted secrets (default, convenient).** The connection string and the public key are stored in
  GitHub's encrypted secret store of the *private* backup repository only; they are never in a file, a commit, a
  log or a report. This does put one database credential in GitHub's secret store - hence the read-only role.
- **Mode B - nothing in GitHub at all.** Run `scripts/backup/backup.sh` yourself from a trusted computer on a
  schedule (for example macOS `launchd` or Linux `cron`), with the same two values in that computer's environment.
  The encrypted file lands on that machine; copy it to storage you control. Trade-off: it only runs while the
  computer is on and you must monitor it.
