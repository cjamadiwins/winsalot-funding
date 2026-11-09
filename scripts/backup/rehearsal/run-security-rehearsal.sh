#!/usr/bin/env bash
# End-to-end, fully local rehearsal of the pending security changes on a realistic copy:
#   1. rebuild the real schema with fake data, 2. back it up (encrypted), 3. restore into a second
#   empty database, 4. apply round 1 and phase 2 to the RESTORED COPY, 5. prove nothing any role can
#   see changed, 6. roll both back and prove permissions return to the originals.
# Needs: local Postgres server binaries (client tools on PATH), age. Touches nothing remote.
#   PGADMIN_URL=postgresql://postgres@127.0.0.1:5432/postgres scripts/backup/rehearsal/run-security-rehearsal.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
[ -n "${PGADMIN_URL:-}" ] || { echo "PGADMIN_URL is not set" >&2; exit 1; }
base="${PGADMIN_URL%/*}"; host="$(printf '%s' "$base" | sed -E 's#^[a-z]+://([^@]*@)?(\[[^]]+\]|[^:/?]+).*#\2#')"
case "$host" in localhost|127.0.0.1) ;; *) echo "refusing non-local server" >&2; exit 1 ;; esac
stamp="$(date +%s)"; SRC="rehearsal_src_$stamp"; DST="rehearsal_dst_$stamp"
A=(psql "$PGADMIN_URL" --no-psqlrc -X -q -At); S=(psql "$base/$SRC" --no-psqlrc -X -q -At); D=(psql "$base/$DST" --no-psqlrc -X -q -At)
pass=0; fail=0
check() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "  PASS  $2"; else fail=$((fail + 1)); echo "  FAIL  $2"; fi; }
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
"${A[@]}" -c "create database $SRC" -c "create database $DST" >/dev/null

echo "1. rebuild the real schema with fake data"
REPLICA_DB_URL="$base/$SRC" "$HERE/build-replica.sh" | sed 's/^/   /'
age-keygen -o "$W/id.txt" 2>"$W/pub.txt"; PUB="$(sed -E 's/.*(age1[0-9a-z]+).*/\1/' "$W/pub.txt")"

echo "2. encrypted backup, 3. restore into an empty database"
SUPABASE_DB_URL="$base/$SRC" BACKUP_AGE_PUBLIC_KEY="$PUB" OUT_DIR="$W/out" "$ROOT/scripts/backup/backup.sh" | sed 's/^/   /'
B="$(ls "$W"/out/*.tar.age)"
out="$(RESTORE_DB_URL="$base/$DST" "$ROOT/scripts/backup/verify-restore.sh" "$B" "$W/id.txt")"; echo "$out" | sed 's/^/   /'
echo "$out" | grep -q "verify-restore: PASS" && check ok "restore matches the backup manifest" || check bad "restore matches the backup manifest"

echo "4. permissions and visibility BEFORE the security changes (restored copy)"
"${D[@]}" -f "$HERE/visibility.sql" >/dev/null
ids() { "${D[@]}" -c "$1"; }
ADMIN="$(ids "select id from crm_users where role='admin' limit 1")"; AGENT="$(ids "select id from crm_users where role='agent' order by email limit 1")"
LGA="$(ids "select id from leadgen_users where role='agent' order by email limit 1")"
"${D[@]}" -c "insert into crm_subcontractors(full_name, pay_type) values ('Synthetic Sub','hourly')" -c "insert into auth.users(id,email) values (gen_random_uuid(),'sub-user@example.invalid')" -c "insert into crm_users(id,full_name,email,role,active,subcontractor_id) select u.id,'Synthetic Sub User','sub-user@example.invalid','subcontractor',true,s.id from auth.users u, crm_subcontractors s where u.email='sub-user@example.invalid' limit 1" >/dev/null
SUB="$(ids "select id from crm_users where role='subcontractor' limit 1")"
snap() { for c in "anon:" "authenticated:$ADMIN" "authenticated:$AGENT" "authenticated:$SUB" "authenticated:$LGA" "service_role:"; do r="${c%%:*}"; s="${c#*:}"; echo "## $r ${s:0:8}"; "${D[@]}" -c "set role $r; select set_config('request.jwt.claim.sub','$s',false); select tbl||'='||n from zz.visible_counts()" | grep -v '^$'; done; }
guard() { "${D[@]}" -c "select 'policies:'||md5(string_agg(tablename||policyname||coalesce(qual,'')||coalesce(with_check,'')||cmd, '|' order by tablename, policyname)) from pg_policies where schemaname='public'" -c "select 'table_acl:'||md5(string_agg(c.relname||coalesce(c.relacl::text,''), '|' order by c.relname)) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'" -c "select 'func_src:'||md5(string_agg(p.prosrc, '|' order by p.proname, p.prosrc)) from pg_proc p where p.pronamespace='public'::regnamespace" -c "select 'triggers:'||md5(string_agg(tgname||tgrelid::regclass::text||tgenabled::text, '|' order by tgname, tgrelid::regclass::text)) from pg_trigger where not tgisinternal"; }
grants() { "${D[@]}" -c "select p.proname||'('||pg_get_function_identity_arguments(p.oid)||'): '||coalesce((select string_agg(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end, ',' order by case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end) from aclexplode(p.proacl) a where a.privilege_type='EXECUTE'),'default') from pg_proc p where p.pronamespace='public'::regnamespace order by 1"; }
snap > "$W/v0"; guard > "$W/g0"; grants > "$W/a0"

echo "5. apply round 1 + phase 2 to the restored copy"
for f in supabase/pending-approval/20261020120000_security_revoke_unneeded_function_execute.sql supabase/pending-approval/20261020140000_security_phase2_rls_helpers_authenticated_only.sql; do
  psql "$base/$DST" --no-psqlrc -X -q -v ON_ERROR_STOP=1 -1 -f "$ROOT/$f" >/dev/null 2>"$W/err" && check ok "applied $(basename "$f") (its built-in self-check passed)" || { check bad "applied $(basename "$f")"; cat "$W/err"; }
done
snap > "$W/v1"; guard > "$W/g1"; grants > "$W/a1"
diff -q "$W/g0" "$W/g1" >/dev/null && check ok "row-security policies, table permissions, function code and triggers unchanged" || check bad "policies/permissions/code/triggers unchanged"
diff -q "$W/v0" "$W/v1" >/dev/null && check ok "rows visible to anon, Growth admin, Growth agent, subcontractor, Lead Gen agent and the server are identical across 37 tables" || check bad "visible rows identical"
for fn in "claim_due_crm_marketing_enrollments(5)" "claim_due_crm_retention_enrollments(5)" "claim_due_crm_retention_followups(5)"; do
  for r in anon authenticated; do o="$("${D[@]}" -c "set role $r; select count(*) from $fn" 2>&1)"; grep -q "permission denied" <<<"$o" && check ok "$r cannot call $fn" || check bad "$r cannot call $fn"; done
done
"${D[@]}" -c "set role service_role; select count(*) from claim_due_crm_marketing_enrollments(5)" >/dev/null 2>&1 && check ok "the server (service_role) can still claim jobs" || check bad "service_role claim"
o="$("${D[@]}" -c "set role anon; select winsalot_is_admin_employee(gen_random_uuid())" 2>&1)"; grep -q "permission denied" <<<"$o" && check ok "anon cannot call the RLS helper functions" || check bad "anon helper"
[ "$("${D[@]}" -c "set role authenticated; select winsalot_is_admin_employee('$ADMIN')")" = "t" ] && check ok "signed-in admin still recognised as admin" || check bad "admin recognised"
o="$("${D[@]}" -c "set role authenticated; select next_provider_invoice_number()" 2>&1)"; grep -q "^INV-" <<<"$o" && check ok "signed-in users can still generate provider invoice numbers" || check bad "provider invoice number"

echo "6. roll both back"
for f in supabase/rollbacks/20261020140000_security_phase2_rls_helpers_authenticated_only_rollback.sql supabase/rollbacks/20261020120000_security_revoke_unneeded_function_execute_rollback.sql; do
  psql "$base/$DST" --no-psqlrc -X -q -v ON_ERROR_STOP=1 -1 -f "$ROOT/$f" >/dev/null 2>&1 && check ok "rolled back $(basename "$f")" || check bad "rolled back $(basename "$f")"
done
grants > "$W/a2"; diff -q "$W/a0" "$W/a2" >/dev/null && check ok "function permissions are exactly the originals again" || { check bad "function permissions restored"; diff "$W/a0" "$W/a2" | head; }

"${A[@]}" -c "drop database $SRC" -c "drop database $DST" >/dev/null
echo; echo "rehearsal result: $pass passed, $fail failed"; [ "$fail" -eq 0 ]
