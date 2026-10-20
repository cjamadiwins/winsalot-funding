#!/usr/bin/env bash
# Restore-test an encrypted backup into a THROWAWAY local Postgres and compare
# it with the manifest taken at backup time. Run this on your own machine; the
# age private key is only ever passed as a local file path and is never
# uploaded anywhere.
#
# Usage:  RESTORE_DB_URL=postgresql://user:pw@localhost:5432/scratch \
#         scripts/backup/verify-restore.sh <bundle.tar.age> <age-identity-file>
#
# Safety: refuses any target that is not localhost/127.0.0.1/::1/a unix socket,
# and refuses anything that looks like Supabase. The scratch database must be
# empty. Prints counts and object names only - never row data.
set -euo pipefail
set +x
umask 077

fail() { echo "verify-restore: $*" >&2; exit 1; }
[ "$#" -eq 2 ] || fail "usage: verify-restore.sh <bundle.tar.age> <age-identity-file>"
bundle="$1"; identity="$2"
[ -f "$bundle" ] || fail "bundle not found"
[ -f "$identity" ] || fail "identity file not found"
[ -n "${RESTORE_DB_URL:-}" ] || fail "RESTORE_DB_URL is not set"

host="$(printf '%s' "$RESTORE_DB_URL" | sed -E 's#^[a-z]+://([^@]*@)?(\[[^]]+\]|[^:/?]+).*#\2#')"
case "$host" in
  localhost|127.0.0.1|'[::1]'|::1) ;;
  *) case "$RESTORE_DB_URL" in *host=/*|*"%2F"*) ;; *) fail "refusing non-local restore target" ;; esac ;;
esac
case "$RESTORE_DB_URL" in *supabase*) fail "refusing a Supabase target" ;; esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
psql_t() { psql "$RESTORE_DB_URL" --no-psqlrc -X -v ON_ERROR_STOP=1 -At "$@"; }

nonempty="$(psql_t -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','p')")"
[ "$nonempty" = "0" ] || fail "target database is not empty ($nonempty tables); use a fresh scratch database"

( cd "$(dirname "$bundle")" && [ ! -f "$(basename "$bundle").sha256" ] || sha256sum -c "$(basename "$bundle").sha256" >/dev/null ) || fail "checksum mismatch"
age -d -i "$identity" -o "$WORK/bundle.tar" "$bundle" || fail "decryption failed"
tar -C "$WORK" -xf "$WORK/bundle.tar"
want="$(grep '^dump_sha256=' "$WORK/meta.txt" | cut -d= -f2)"
got="$(sha256sum "$WORK/db.pgdump" | cut -d' ' -f1)"
[ "$want" = "$got" ] || fail "dump checksum differs from meta.txt"
echo "verify-restore: decrypted and checksum OK"

# Roles/schemas Supabase provides on every project; harmless if they exist.
psql_t -c "
do \$\$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_admin','supabase_storage_admin','dashboard_user','pgbouncer'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  end loop;
end \$\$;
create schema if not exists extensions;
create extension if not exists \"uuid-ossp\" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;" >/dev/null 2>"$WORK/ext.err" || true

# The dump recreates the public schema, so start from a clean slate (the target
# was verified empty above).
psql_t -c "drop schema if exists public cascade" >/dev/null
set +e
pg_restore --no-owner --dbname="$RESTORE_DB_URL" "$WORK/db.pgdump" 2>"$WORK/restore.err"
set -e
# Only error headlines are shown; DETAIL lines can quote row values, so drop them.
errs="$(grep -c '^pg_restore: error:' "$WORK/restore.err" || true)"
echo "verify-restore: pg_restore reported $errs error(s)"
grep '^pg_restore: error:' "$WORK/restore.err" | cut -c1-200 | head -20 || true

# Compare against the manifest.
psql_t -F $'\t' -c "
  select 'rows', n.nspname || '.' || c.relname,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('public','auth','storage','private','supabase_migrations')
  order by 2" > "$WORK/restored.tsv"
psql_t -F $'\t' -c "
  select 'structure', k, v from (values
    ('public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p'))),
    ('public_tables_rls_on', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity)),
    ('public_policies', (select count(*) from pg_policies where schemaname='public')),
    ('public_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')),
    ('public_indexes', (select count(*) from pg_indexes where schemaname='public')),
    ('public_triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal))
  ) s(k, v) order by k" >> "$WORK/restored.tsv"

if diff <(sort "$WORK/manifest.tsv") <(sort "$WORK/restored.tsv") > "$WORK/diff.txt"; then
  echo "verify-restore: PASS - every table row count and object count matches the manifest ($(grep -c '^rows' "$WORK/manifest.tsv") tables)"
else
  echo "verify-restore: FAIL - differences from the manifest (table/object names and counts only):"
  head -40 "$WORK/diff.txt" | cut -c1-200
  exit 2
fi
