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
#   CRITICAL_TABLES         optional space-separated schema.table list that MUST be
#                           present in the dump (default: the leads, appointments, call
#                           logs, agent assignments, client campaigns, payroll, lending
#                           and login tables). The backup fails if any is missing.
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

# Manifest: exact row counts per table + object counts. Counts only, no data.
# The live database keeps changing while the dump runs, so row counts are taken
# just before and just after it; a correct restore must land between the two.
count_rows() {
  psql_q -F $'\t' -c "
    select 'rows', n.nspname || '.' || c.relname,
           (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','auth','storage','private','supabase_migrations')
    order by 2" > "$1"
}
count_rows "$WORK/rows.before"

pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --compress=6 \
  "${schema_args[@]}" --file="$WORK/db.pgdump"

count_rows "$WORK/rows.after"
# rows <TAB> table <TAB> lowest count seen <TAB> highest count seen
awk -F'\t' 'NR==FNR { before[$2] = $3; next } { lo = before[$2]; hi = $3; if (lo == "") lo = hi; if (lo + 0 > hi + 0) { t = lo; lo = hi; hi = t } print "rows\t" $2 "\t" lo "\t" hi }' \
  "$WORK/rows.before" "$WORK/rows.after" > "$WORK/manifest.tsv"
psql_q -F $'\t' -c "
  select 'structure', k, v, v from (values
    ('public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p'))),
    ('public_tables_rls_on', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity)),
    ('public_policies', (select count(*) from pg_policies where schemaname='public')),
    ('public_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')),
    ('public_indexes', (select count(*) from pg_indexes where schemaname='public')),
    ('public_triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal))
  ) s(k, v) order by k" >> "$WORK/manifest.tsv"

CRITICAL_TABLES="${CRITICAL_TABLES:-public.leadgen_leads public.crm_leads public.crm_opportunities public.call_list_leads public.call_list_segments public.call_list_segment_agents public.winsalot_appointments public.leadgen_appointments public.crm_call_logs public.leadgen_call_logs public.leadgen_campaigns public.leadgen_clients public.leadgen_campaign_agents public.crm_clients public.crm_agent_service_assignments public.crm_payroll public.leadgen_payroll public.agent_attendance public.leadgen_agent_attendance public.crm_lending_partners public.crm_users public.leadgen_users auth.users}"
missing=0; present=0
for tbl in $CRITICAL_TABLES; do
  if grep -q -F "$(printf 'rows\t%s\t' "$tbl")" "$WORK/manifest.tsv"; then present=$((present + 1)); else missing=$((missing + 1)); echo "backup: critical table missing from backup: $tbl" >&2; fi
done
[ "$missing" -eq 0 ] || fail "$missing critical table(s) missing - refusing to produce an incomplete backup"
echo "backup: critical tables present: $present/$present"

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
