#!/usr/bin/env bash
# Offline end-to-end rehearsal of backup.sh + verify-restore.sh against a
# synthetic, Supabase-shaped database in a throwaway local Postgres cluster.
# Touches nothing remote and uses no real data or credentials. Needs the
# Postgres server binaries, age and (when run as root) the `postgres` OS user.
set -euo pipefail
PGBIN="${PGBIN:-$(dirname "$(ls /usr/lib/postgresql/*/bin/initdb | sort -V | tail -1)")}"
export PATH="$PGBIN:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; chmod 755 "$T"
PORT="${PORT:-54399}"
run_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$T"
cleanup() { run_pg "PATH=$PGBIN:\$PATH pg_ctl -D $T/data stop -m immediate >/dev/null 2>&1" || true; rm -rf "$T"; }
trap cleanup EXIT
run_pg "PATH=$PGBIN:\$PATH initdb -D $T/data -A trust >/dev/null && PATH=$PGBIN:\$PATH pg_ctl -D $T/data -o '-p $PORT -k $T -c listen_addresses=127.0.0.1' -l $T/pg.log -w start >/dev/null"
SRC="postgresql://postgres@127.0.0.1:$PORT/src"; DST="postgresql://postgres@127.0.0.1:$PORT/scratch"
psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -qXc "create database src" -c "create database scratch"
psql "$SRC" -qX -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create table auth.users(id uuid primary key, email text, encrypted_password text);
insert into auth.users values ('00000000-0000-0000-0000-000000000001','a@example.invalid','x'),('00000000-0000-0000-0000-000000000002','b@example.invalid','y');
create schema private; create function private.ping() returns int language sql as 'select 1';
create schema storage; create table storage.buckets(id text primary key);
create table crm_users(id uuid primary key references auth.users(id), role text, active boolean);
insert into crm_users values ('00000000-0000-0000-0000-000000000001','admin',true);
create table leadgen_call_logs(id serial primary key, note text); insert into leadgen_call_logs(note) select 'call '||g from generate_series(1,250) g;
create table crm_payroll(id serial primary key, amount numeric); insert into crm_payroll(amount) values (1),(2),(3);
alter table crm_users enable row level security;
create policy own on crm_users for select to authenticated using (id = '00000000-0000-0000-0000-000000000001');
grant select on crm_users to authenticated;
create function public.helper() returns int language sql as 'select 1';
SQL
KEYDIR="$T/keys"; mkdir -p "$KEYDIR"; age-keygen -o "$KEYDIR/id.txt" 2>"$KEYDIR/pub.txt"; PUB="$(sed -E 's/.*(age1[0-9a-z]+).*/\1/' "$KEYDIR/pub.txt")"
export SUPABASE_DB_URL="$SRC" BACKUP_AGE_PUBLIC_KEY="$PUB" OUT_DIR="$T/out" CRITICAL_TABLES="public.crm_users public.leadgen_call_logs public.crm_payroll auth.users"
echo "== 1. backup"; "$HERE/backup.sh"
BUNDLE="$(ls "$T"/out/*.tar.age)"
echo "== 2. plaintext must not be present in the encrypted bundle"
if grep -aq "a@example.invalid" "$BUNDLE" || grep -aq "PGDMP" "$BUNDLE"; then echo "FAIL: plaintext visible"; exit 1; else echo "ok"; fi
echo "== 3. restore + compare"; RESTORE_DB_URL="$DST" "$HERE/verify-restore.sh" "$BUNDLE" "$KEYDIR/id.txt"
echo "== 4. private key as recipient is rejected"
if BACKUP_AGE_PUBLIC_KEY="$(grep AGE-SECRET-KEY "$KEYDIR/id.txt")" "$HERE/backup.sh" 2>"$T/e"; then echo "FAIL: accepted private key"; exit 1; else cat "$T/e"; fi
echo "== 4b. a missing critical table is rejected"
if CRITICAL_TABLES="public.crm_users public.table_that_does_not_exist" "$HERE/backup.sh" 2>"$T/e"; then echo "FAIL: incomplete backup accepted"; exit 1; else cat "$T/e"; fi
echo "== 5. missing secrets are rejected"
if env -u SUPABASE_DB_URL "$HERE/backup.sh" 2>"$T/e"; then echo "FAIL"; exit 1; else cat "$T/e"; fi
echo "== 6. wrong key cannot decrypt"
age-keygen -o "$KEYDIR/other.txt" 2>/dev/null
psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -qXc "drop database scratch" -c "create database scratch"
if RESTORE_DB_URL="$DST" "$HERE/verify-restore.sh" "$BUNDLE" "$KEYDIR/other.txt" 2>"$T/e"; then echo "FAIL"; exit 1; else cat "$T/e"; fi
echo "== 7. tampered bundle is rejected"
cp "$BUNDLE" "$T/t.tar.age"; printf 'x' >> "$T/t.tar.age"; cp "$BUNDLE.sha256" "$T/t.tar.age.sha256"; sed -i "s/winsalot-db-[0-9TZ]*.tar.age/t.tar.age/" "$T/t.tar.age.sha256"
if RESTORE_DB_URL="$DST" "$HERE/verify-restore.sh" "$T/t.tar.age" "$KEYDIR/id.txt" 2>"$T/e"; then echo "FAIL"; exit 1; else cat "$T/e"; fi
echo "== 8. restore target safety"
if RESTORE_DB_URL="postgresql://postgres:pw@db.example.supabase.co:5432/postgres" "$HERE/verify-restore.sh" "$BUNDLE" "$KEYDIR/id.txt" 2>"$T/e"; then echo "FAIL"; exit 1; else cat "$T/e"; fi
echo "ALL LOCAL BACKUP/RESTORE REHEARSAL CHECKS PASSED"
