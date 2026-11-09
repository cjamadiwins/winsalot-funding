#!/usr/bin/env bash
# Rebuilds the full application schema from this repository's migrations in an EMPTY
# local scratch database, then fills it with fake rows. Local rehearsal only: it
# refuses any target that is not localhost and any database that already has tables.
#
#   REPLICA_DB_URL=postgresql://postgres@127.0.0.1:5432/replica scripts/backup/rehearsal/build-replica.sh
#
# Expected: ~236 of 245 migrations apply; the rest are one-off production data fixes that
# assert specific production rows exist (they fail on an empty database, harmlessly).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
[ -n "${REPLICA_DB_URL:-}" ] || { echo "REPLICA_DB_URL is not set" >&2; exit 1; }
case "$REPLICA_DB_URL" in *supabase*) echo "refusing a Supabase target" >&2; exit 1 ;; esac
host="$(printf '%s' "$REPLICA_DB_URL" | sed -E 's#^[a-z]+://([^@]*@)?(\[[^]]+\]|[^:/?]+).*#\2#')"
case "$host" in localhost|127.0.0.1) ;; *) echo "refusing non-local target" >&2; exit 1 ;; esac
P=(psql "$REPLICA_DB_URL" --no-psqlrc -X -q)
[ "$("${P[@]}" -At -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind='r'")" = "0" ] || { echo "target database is not empty" >&2; exit 1; }
"${P[@]}" -v ON_ERROR_STOP=1 -f "$HERE/supabase-stand-ins.sql" 2>&1 | grep -v 'wal_level\|HINT' || true
ok=0; failed=0
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  # pg_cron / pg_net are provided by the stand-ins instead of real extensions
  if sed -E '/create extension if not exists pg_(cron|net)/Id' "$f" | "${P[@]}" -v ON_ERROR_STOP=1 -1 >/dev/null 2>&1; then ok=$((ok + 1)); else failed=$((failed + 1)); fi
done
echo "replica: $ok migrations applied, $failed skipped (expected ~9 production-data fixes)"
"${P[@]}" -f "$HERE/seed-synthetic.sql" 2>&1 | grep -i 'synthetic rows' || true
"${P[@]}" -v ON_ERROR_STOP=1 -f "$HERE/seed-core-records.sql" >/dev/null && echo "replica: core fake records inserted"
"${P[@]}" -At -c "select 'replica: ' || count(*) || ' public tables' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
