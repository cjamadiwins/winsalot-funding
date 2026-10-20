# Database backup and restore (Business Finance Supabase project)

Two layers protect the database:

1. **Supabase daily backups** (Pro plan, 7-day retention, restore from the dashboard).
2. **Encrypted nightly off-site backup** (this document): `scripts/backup/backup.sh`, run by
   `.github/workflows/nightly-db-backup.yml`, stored as a private GitHub Actions artifact for 30 days.

Nothing here enables PITR or any paid Supabase feature.

> **Status: the workflow is inactive by design.** The `schedule:` trigger is commented out and
> scheduled runs also require the repository variable `BACKUP_ENABLED=true`. Do not unlock either
> until every step in "Activation checklist" is done.

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
  `age-keygen -o winsalot-backup-key.txt` (prints the public key, `age1...`, to the terminal).
- **The private key never goes into GitHub, the repo, chat, or an email.** Put it in your password
  manager *and* a second offline location (for example a printed copy in a safe). Losing it means
  every backup is unrecoverable; leaking it means every backup can be read.
- Only the **public** key (`age1...`) is stored in GitHub, as the secret `BACKUP_AGE_PUBLIC_KEY`.
  `backup.sh` refuses to run if that value is a private key.
- Optional second holder: put two public keys in the secret, separated by a comma. Either private key
  can then open every backup.
- Rotation: generate a new pair, update the secret, keep the old private key for as long as old
  artifacts (30 days) exist.

## Configure the GitHub secrets securely

1. **Database connection string.** Supabase dashboard -> project *Business Finance* -> **Connect**
   -> **Session pooler** (GitHub runners cannot use the direct IPv6-only address). Copy the
   `postgresql://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres` string.
   Enter your database password in place of the placeholder yourself; do not paste it into chat,
   issues, commits or documents. If you do not have the database password, reset it under
   Project settings -> Database *(this changes the password the apps' direct DB connections use, if
   any - the apps in this repo talk to Supabase through the API keys, but confirm before resetting)*.
2. GitHub -> repository **Settings -> Secrets and variables -> Actions -> New repository secret**
   - `SUPABASE_DB_URL` = the string from step 1
   - `BACKUP_AGE_PUBLIC_KEY` = the `age1...` public key
3. Use *repository secrets*, not variables. Secret values are masked in logs and cannot be read back
   through the GitHub UI or API after saving.
4. Restrict who can change workflows and secrets (Settings -> Collaborators / branch protection on
   `main`). Anyone who can edit a workflow on a branch that is allowed to use secrets could exfiltrate
   them, so keep write access to people you trust.
5. Never run this against a database you do not own, and never put either secret in a workflow
   `echo`, `env` dump or debug step.

Optional hardening (needs a separate production approval, so it is not part of this change): create a
dedicated read-only database role for backups instead of using the `postgres` user in
`SUPABASE_DB_URL`.

## Activation checklist

1. Generate the key pair offline and store the private key in two places.
2. Add the two secrets above.
3. Run the workflow **manually** (Actions -> Nightly database backup -> Run workflow). Confirm the job
   is green and an artifact `winsalot-db-backup-<id>` appears with a `.tar.age` and `.sha256`.
4. Download the artifact and run a **restore test on your own machine** (next section). It must PASS.
5. Only then: set the repository variable `BACKUP_ENABLED=true` **and** uncomment the `schedule:`
   block in the workflow (a workflow change that needs your approval/merge).
6. Calendar a monthly restore test. GitHub emails you when a scheduled run fails; also glance at the
   Actions tab weekly for the first month.

## Restore test (safe, isolated, never touches production)

Needs Docker or any local Postgres 15+ and the `age` tool. The target must be an **empty scratch
database on your own computer**; the script refuses non-local or Supabase targets.

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

`scripts/backup/test-local.sh` rehearses the entire procedure offline on a synthetic database (backup,
encryption, restore, comparison, wrong-key, tampered-file and unsafe-target checks). It was run
successfully before this was handed over.

## Disaster recovery order of operations

1. **Prefer Supabase's own dashboard restore** (Database -> Backups) for a full in-place recovery - it
   restores everything including Vault and Realtime configuration. Note the project is offline while
   it runs.
2. Use the encrypted off-site backup when the project or its daily backups are unavailable, or to
   recover individual tables: decrypt, restore into a scratch database, then copy only the needed rows.
3. After rebuilding a project from the off-site backup: re-enter the 6 Vault secrets, re-create the
   `pg_cron` jobs from `cron-jobs.tsv` in the bundle, re-apply any grants from the dump, and re-point the
   Vercel environment variables.

## Cost and limits

- **GitHub Actions:** about 2-3 minutes per run, roughly 60-90 minutes/month. Private repositories on
  the Free plan include 2,000 minutes/month. *Confirm your GitHub plan.*
- **Artifact storage:** shares the plan's storage quota (500 MB on Free). The database is 48 MB; a
  compressed, encrypted dump is expected to be a few MB, so 30 daily copies should be well under the
  quota. **This is an estimate** - check the size of the first manual run and multiply by 30.
- **Supabase:** no charge. The dump is a read-only snapshot of a 48 MB database.
- Artifacts expire automatically after 30 days; storage accounting can lag by several hours.
