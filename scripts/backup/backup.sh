#!/usr/bin/env bash
# Encrypted logical backup of the Business Finance Supabase database.
#
# Inputs (environment only - never command-line arguments, never printed):
#   SUPABASE_DB_URL         session-pooler connection string (postgresql://...)
#   BACKUP_AGE_PUBLIC_KEY   age *public* key(s) (age1...), separated by commas
#                           or whitespace if you want a second key holder. The
#                           matching private key(s) must NEVER be stored in
#                           GitHub or this repo.
#   OUT_DIR                 output directory (default: backup-out)
#
# Output: $OUT_DIR/winsalot-db-<UTC timestamp>.tar.age (+ .sha256)
#   The tarball holds the pg_dump archive, a row-count/structure manifest and
#   the pg_cron job list. Everything sensitive is encrypted before it is
#   written outside the temporary directory, and the plaintext is deleted on
#   exit (including on failure).
#
# Logging policy: this script prints sizes, counts and timestamps only. It
# never prints the connection string, key material, or any row data, and it
# never enables shell tracing.
set -euo pipefail
set +x
umask 077

fail() { echo "backup: $*" >&2; exit 1; }

[ -n "${SUPABASE_DB_URL:-}" ] || fail "SUPABASE_DB_URL is not set"
[ -n "${BACKUP_AGE_PUBLIC_KEY:-}" ] || fail "BACKUP_AGE_PUBLIC_KEY is not set"
recipient_args=()
for key in ${BACKUP_AGE_PUBLIC_KEY//,/ }; do
  case "$key" in
    AGE-SECRET-KEY-*) fail "BACKUP_AGE_PUBLIC_KEY holds a PRIVATE key. Remove it from the secret store, generate a new key pair, and keep the private key offline." ;;
  esac
  [[ "$key" =~ ^age1[0-9a-z]{58}$ ]] || fail "BACKUP_AGE_PUBLIC_KEY contains a value that is not a valid age public key"
  recipient_args+=(-r "$key")
done
[ "${#recipient_args[@]}" -gt 0 ] || fail "no age public key found in BACKUP_AGE_PUBLIC_KEY"
command -v age >/dev/null || fail "age is not installed"
command -v pg_dump >/dev/null || fail "pg_dump is not installed"

OUT_DIR="${OUT_DIR:-backup-out}"
mkdir -p "$OUT_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

psql_q() { psql "$SUPABASE_DB_URL" --no-psqlrc -X -v ON_ERROR_STOP=1 -At "$@"; }

# pg_dump refuses to dump a newer server, so fail early with a clear message.
server_major="$(psql_q -c "select current_setting('server_version_num')::int / 10000")"
client_major="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
[ "$client_major" -ge "$server_major" ] || fail "pg_dump $client_major is older than server $server_major"
echo "backup: server major=$server_major client major=$client_major"

# Schemas to include (only those that exist). vault is deliberately excluded:
# its secrets are re-entered from your own secret store after a rebuild, and
# keeping them out of the artifact keeps the blast radius small.
schema_args=()
for s in public auth storage private supabase_migrations; do
  if [ "$(psql_q -c "select count(*) from pg_namespace where nspname = '$s'")" = "1" ]; then
    schema_args+=("--schema=$s")
  fi
done
[ "${#schema_args[@]}" -gt 0 ] || fail "no schemas found to dump"

pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --compress=6 \
  "${schema_args[@]}" --file="$WORK/db.pgdump"

# Manifest: exact row counts per table + object counts. Counts only, no data.
psql_q -F $'\t' -c "
  select 'rows', n.nspname || '.' || c.relname,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('public','auth','storage','private','supabase_migrations')
  order by 2" > "$WORK/manifest.tsv"
psql_q -F $'\t' -c "
  select 'structure', k, v from (values
    ('public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p'))),
    ('public_tables_rls_on', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity)),
    ('public_policies', (select count(*) from pg_policies where schemaname='public')),
    ('public_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')),
    ('public_indexes', (select count(*) from pg_indexes where schemaname='public')),
    ('public_triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal))
  ) s(k, v) order by k" >> "$WORK/manifest.tsv"

if [ "$(psql_q -c "select to_regclass('cron.job') is not null")" = "t" ]; then
  psql_q -F $'\t' -c "select jobname, schedule, active, command from cron.job order by jobid" > "$WORK/cron-jobs.tsv"
else
  : > "$WORK/cron-jobs.tsv"
fi

{
  echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "server_major=$server_major"
  echo "client_version=$(pg_dump --version)"
  echo "dump_sha256=$(sha256sum "$WORK/db.pgdump" | cut -d' ' -f1)"
  echo "schemas=${schema_args[*]#--schema=}"
} > "$WORK/meta.txt"

tar -C "$WORK" -cf "$WORK/bundle.tar" db.pgdump manifest.tsv cron-jobs.tsv meta.txt
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$OUT_DIR/winsalot-db-$stamp.tar.age"
age "${recipient_args[@]}" -o "$out" "$WORK/bundle.tar"
( cd "$OUT_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256" )

size="$(wc -c < "$out")"
[ "$size" -gt 1024 ] || fail "encrypted output is suspiciously small ($size bytes)"
tables="$(grep -c '^rows' "$WORK/manifest.tsv" || true)"
echo "backup: wrote $(basename "$out") ($size bytes encrypted, $tables tables in manifest)"
