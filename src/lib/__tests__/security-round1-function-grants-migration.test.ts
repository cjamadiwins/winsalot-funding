import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Rehearses supabase/migrations/20261020120000_security_revoke_unneeded_function_execute.sql
// on a throwaway in-memory Postgres. The function bodies below are copied
// verbatim from the production definitions (pg_get_functiondef, 2026-10-20);
// the tables are minimal stand-ins with just the columns those bodies touch.
// Production grants are reproduced exactly (see the ACL snapshot in the
// migration header): anon/authenticated/service_role explicitly, plus PUBLIC
// on everything except the three claim_due_* functions and
// crm_subcontractor_visible_clients.

const MIGRATION = "20261020120000_security_revoke_unneeded_function_execute.sql";
const migration = readFileSync(`supabase/migrations/${MIGRATION}`, "utf8");
const rollback = readFileSync(`supabase/rollbacks/20261020120000_security_revoke_unneeded_function_execute_rollback.sql`, "utf8");

const REVOKED_FROM_ANON = [
  "claim_due_crm_marketing_enrollments(integer)",
  "claim_due_crm_retention_enrollments(integer)",
  "claim_due_crm_retention_followups(integer)",
  "next_provider_invoice_number()",
  "crm_subcontractor_visible_clients()",
  "crm_retention_cancel_on_client_archive()",
  "leadgen_conversions_ensure_for_appointment()",
  "winsalot_chat_enforce_edit_or_soft_delete_only()",
  "winsalot_chat_enforce_soft_delete_only()",
  "winsalot_dm_touch_conversation()",
  "rls_auto_enable()",
];
const DEFERRED = ["winsalot_is_active_employee(uuid)", "winsalot_is_admin_employee(uuid)", "crm_user_subcontractor_id(uuid)"];
const ALL = [...REVOKED_FROM_ANON, ...DEFERRED];

const db = new PGlite();
const uid = "00000000-0000-0000-0000-0000000000a1";

const aclSnapshot = async () =>
  (
    await db.query<{ fn: string; grantee: string }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
              case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee
         from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.pronamespace = 'public'::regnamespace and a.privilege_type = 'EXECUTE'
        order by 1, 2`
    )
  ).rows.map((r) => `${r.fn} -> ${r.grantee}`);

const asRole = (role: string) => db.exec(`reset role; set role ${role};`);
const asSuper = () => db.exec("reset role;");
const denied = (sql: string) => expect(db.query(sql)).rejects.toThrow(/permission denied for function/);

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role migrator nologin;
    grant usage, create on schema public to migrator;
    grant usage on schema public to anon, authenticated, service_role;

    create table crm_marketing_enrollments(id uuid primary key default gen_random_uuid(), status text, next_send_at timestamptz, claimed_at timestamptz, claim_token uuid, updated_at timestamptz, contact_email text);
    create table crm_retention_enrollments(id uuid primary key default gen_random_uuid(), client_id uuid, campaign_type text, retention_status text, removed_at timestamptz, next_send_at timestamptz, claimed_at timestamptz, claim_token uuid, updated_at timestamptz, stopped_at timestamptz);
    create table crm_retention_followups(id uuid primary key default gen_random_uuid(), resolved_at timestamptz, cancelled_at timestamptz, sent_at timestamptz, auto_send boolean, follow_up_date date, claimed_at timestamptz, claim_token uuid, updated_at timestamptz);
    create table crm_retention_events(id uuid primary key default gen_random_uuid(), client_id uuid, enrollment_id uuid, event_type text, notes text);
    create table crm_clients(id uuid primary key default gen_random_uuid(), company_name text, status text);
    create table crm_subcontractor_client_assignments(client_id uuid, subcontractor_id uuid, unassigned_at timestamptz);
    create table crm_users(id uuid primary key, active boolean, role text, subcontractor_id uuid);
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table provider_invoice_number_counters(year int primary key, last_number int);
    create table leadgen_leads(id uuid primary key default gen_random_uuid(), campaign_id uuid, assigned_agent_id uuid);
    create table leadgen_appointments(id uuid primary key default gen_random_uuid(), lead_id uuid, client_id uuid, campaign_id uuid, assigned_specialist_id uuid);
    create table leadgen_conversions(id uuid primary key default gen_random_uuid(), lead_id uuid, appointment_id uuid unique, client_id uuid, campaign_id uuid, agent_id uuid);
    create table crm_company_messages(id uuid primary key default gen_random_uuid(), content text, edited_at timestamptz, deleted_at timestamptz, deleted_by uuid, deleted_by_name text, sender_id uuid);
    create table crm_announcements(id uuid primary key default gen_random_uuid(), content text, pinned boolean default false, deleted_at timestamptz, deleted_by uuid, deleted_by_name text);
    create table winsalot_dm_conversations(id uuid primary key default gen_random_uuid(), last_message_at timestamptz);
    create table crm_dm_messages(id uuid primary key default gen_random_uuid(), conversation_id uuid, content text, edited_at timestamptz, deleted_at timestamptz, deleted_by uuid, deleted_by_name text, created_at timestamptz default now());

    create function public.claim_due_crm_marketing_enrollments(p_limit integer DEFAULT 50) returns setof crm_marketing_enrollments language plpgsql security definer set search_path to 'public' as $function$
    begin
      return query with due as (select e.id from public.crm_marketing_enrollments e where e.status = 'active' and e.next_send_at <= now() and (e.claimed_at is null or e.claimed_at < now() - interval '30 minutes') order by e.next_send_at asc limit least(greatest(p_limit, 1), 100) for update skip locked)
      update public.crm_marketing_enrollments e set claimed_at = now(), claim_token = gen_random_uuid(), updated_at = now() from due where e.id = due.id returning e.*;
    end; $function$;
    create function public.claim_due_crm_retention_enrollments(p_limit integer DEFAULT 50) returns setof crm_retention_enrollments language plpgsql security definer set search_path to 'public' as $function$
    begin
      return query with due as (select e.id from public.crm_retention_enrollments e where e.removed_at is null and ((e.campaign_type = 'client_success' and e.retention_status = 'active') or (e.campaign_type = 're_engagement' and e.retention_status = 're_engagement')) and e.next_send_at is not null and e.next_send_at <= now() and (e.claimed_at is null or e.claimed_at < now() - interval '30 minutes') order by e.next_send_at asc limit least(greatest(p_limit, 1), 100) for update skip locked)
      update public.crm_retention_enrollments e set claimed_at = now(), claim_token = gen_random_uuid(), updated_at = now() from due where e.id = due.id returning e.*;
    end; $function$;
    create function public.claim_due_crm_retention_followups(p_limit integer DEFAULT 50) returns setof crm_retention_followups language plpgsql security definer set search_path to 'public' as $function$
    begin
      return query with due as (select f.id from public.crm_retention_followups f where f.resolved_at is null and f.cancelled_at is null and f.sent_at is null and f.auto_send = true and f.follow_up_date <= current_date and (f.claimed_at is null or f.claimed_at < now() - interval '30 minutes') order by f.follow_up_date asc limit least(greatest(p_limit, 1), 100) for update skip locked)
      update public.crm_retention_followups f set claimed_at = now(), claim_token = gen_random_uuid(), updated_at = now() from due where f.id = due.id returning f.*;
    end; $function$;
    create function public.crm_user_subcontractor_id(uid uuid) returns uuid language sql stable security definer set search_path to 'public' as $function$ select subcontractor_id from public.crm_users where id = uid and active and role = 'subcontractor' limit 1; $function$;
    create function public.crm_subcontractor_visible_clients() returns table(id uuid, company_name text, primary_contact_name text, service text, status text) language sql stable security definer set search_path to 'public' as $function$
      select c.id, c.company_name, null::text, null::text, c.status from public.crm_clients c join public.crm_subcontractor_client_assignments a on a.client_id = c.id where a.subcontractor_id = public.crm_user_subcontractor_id(auth.uid()) and a.unassigned_at is null; $function$;
    create function public.crm_retention_cancel_on_client_archive() returns trigger language plpgsql security definer set search_path to 'public' as $function$
    begin
      if new.status = 'Archived' and old.status is distinct from new.status then
        update public.crm_retention_enrollments set retention_status = 'cancelled', stopped_at = now(), claim_token = null, claimed_at = null, updated_at = now() where client_id = new.id and retention_status <> 'cancelled';
        insert into public.crm_retention_events (client_id, enrollment_id, event_type, notes) select e.client_id, e.id, 'stopped', 'Client archived in Growth CRM - all retention emails cancelled automatically.' from public.crm_retention_enrollments e where e.client_id = new.id and e.updated_at >= now() - interval '5 seconds';
      end if;
      return new;
    end; $function$;
    create function public.leadgen_conversions_ensure_for_appointment() returns trigger language plpgsql security definer set search_path to 'public' as $function$
    declare lead_campaign_id uuid; lead_agent_id uuid;
    begin
      if new.lead_id is not null then select campaign_id, assigned_agent_id into lead_campaign_id, lead_agent_id from public.leadgen_leads where id = new.lead_id; end if;
      insert into public.leadgen_conversions (lead_id, appointment_id, client_id, campaign_id, agent_id) values (new.lead_id, new.id, new.client_id, coalesce(new.campaign_id, lead_campaign_id), coalesce(new.assigned_specialist_id, lead_agent_id)) on conflict (appointment_id) do nothing;
      return new;
    end; $function$;
    create function public.next_provider_invoice_number() returns text language plpgsql security definer set search_path to 'public' as $function$
    declare yr int := extract(year from now())::int; n int;
    begin
      insert into public.provider_invoice_number_counters (year, last_number) values (yr, 1) on conflict (year) do update set last_number = provider_invoice_number_counters.last_number + 1 returning last_number into n;
      return 'INV-' || yr || '-' || lpad(n::text, 4, '0');
    end; $function$;
    create table provider_invoices(id uuid primary key default gen_random_uuid(), invoice_number text not null unique default public.next_provider_invoice_number(), memo text);
    create function public.winsalot_chat_enforce_edit_or_soft_delete_only() returns trigger language plpgsql security definer set search_path to 'public' as $function$
    begin
      if (to_jsonb(new) - 'content' - 'edited_at' - 'deleted_at' - 'deleted_by' - 'deleted_by_name') is distinct from (to_jsonb(old) - 'content' - 'edited_at' - 'deleted_at' - 'deleted_by' - 'deleted_by_name') then
        raise exception 'Only editing your own message content, or deleting it, may change it after it is posted.';
      end if;
      if new.content is distinct from old.content then new.edited_at := now(); end if;
      return new;
    end; $function$;
    create function public.winsalot_chat_enforce_soft_delete_only() returns trigger language plpgsql security definer set search_path to 'public' as $function$
    begin
      if (to_jsonb(new) - 'deleted_at' - 'deleted_by' - 'deleted_by_name' - 'pinned') is distinct from (to_jsonb(old) - 'deleted_at' - 'deleted_by' - 'deleted_by_name' - 'pinned') then
        raise exception 'Only deletion (or, for announcements, pinning) may change after a message is posted.';
      end if;
      return new;
    end; $function$;
    create function public.winsalot_dm_touch_conversation() returns trigger language plpgsql security definer set search_path to 'public' as $function$
    begin update public.winsalot_dm_conversations set last_message_at = new.created_at where id = new.conversation_id; return new; end; $function$;
    create function public.winsalot_is_active_employee(uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $function$ select exists (select 1 from public.crm_users where id = uid and active) $function$;
    create function public.winsalot_is_admin_employee(uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $function$ select exists (select 1 from public.crm_users where id = uid and active and role = 'admin') $function$;
    create function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path to 'pg_catalog' as $function$
    DECLARE cmd record;
    BEGIN
      FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') AND object_type IN ('table','partitioned table') LOOP
        IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') THEN
          BEGIN EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
          EXCEPTION WHEN OTHERS THEN RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity; END;
        END IF;
      END LOOP;
    END; $function$;

    create trigger crm_retention_cancel_on_client_archive after update of status on crm_clients for each row execute function crm_retention_cancel_on_client_archive();
    create trigger leadgen_conversions_ensure_trigger after insert on leadgen_appointments for each row execute function leadgen_conversions_ensure_for_appointment();
    create trigger crm_company_messages_edit_or_soft_delete_only before update on crm_company_messages for each row execute function winsalot_chat_enforce_edit_or_soft_delete_only();
    create trigger crm_announcements_soft_delete_only before update on crm_announcements for each row execute function winsalot_chat_enforce_soft_delete_only();
    create trigger crm_dm_messages_touch_conversation after insert on crm_dm_messages for each row execute function winsalot_dm_touch_conversation();
    create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function rls_auto_enable();

    -- Reproduce production grants: explicit anon/authenticated/service_role everywhere; PUBLIC removed on the
    -- three claim_due_* functions and crm_subcontractor_visible_clients; no explicit anon on next_provider_invoice_number.
    grant execute on all functions in schema public to anon, authenticated, service_role;
    revoke execute on function public.claim_due_crm_marketing_enrollments(integer), public.claim_due_crm_retention_enrollments(integer), public.claim_due_crm_retention_followups(integer), public.crm_subcontractor_visible_clients(), public.crm_user_subcontractor_id(uuid), public.winsalot_is_active_employee(uuid), public.winsalot_is_admin_employee(uuid) from public;
    revoke execute on function public.winsalot_is_active_employee(uuid), public.winsalot_is_admin_employee(uuid) from public; grant execute on function public.winsalot_is_active_employee(uuid), public.winsalot_is_admin_employee(uuid) to public;
    revoke execute on function public.next_provider_invoice_number() from anon;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
    grant select on crm_users to anon;
  `);
}, 60000);
afterAll(async () => { await db.close(); });

describe("before the migration (documents the exposure)", () => {
  it("anon can read and lock marketing enrollment rows through the claim function", async () => {
    await asSuper();
    await db.exec("insert into crm_marketing_enrollments(status,next_send_at,contact_email) values ('active', now() - interval '1 hour', 'lead@example.invalid')");
    await asRole("anon");
    const { rows } = await db.query<{ contact_email: string }>("select * from claim_due_crm_marketing_enrollments(10)");
    expect(rows).toHaveLength(1);
    expect(rows[0].contact_email).toBe("lead@example.invalid");
    await asSuper();
    await db.exec("delete from crm_marketing_enrollments");
  });
});

describe("migration", () => {
  let before: string[];
  beforeAll(async () => { await asSuper(); before = await aclSnapshot(); await db.exec(migration); });

  it("only changes privileges: no table, row or policy statements", () => {
    const body = migration.replace(/--.*$/gm, "");
    const withoutSelfCheck = body.slice(0, body.indexOf("do $$"));
    expect(body.slice(body.indexOf("do $$"))).not.toMatch(/\b(drop|truncate|delete|update|insert|grant|revoke)\b/i);
    const statements = withoutSelfCheck.split(";").map((s) => s.trim()).filter(Boolean);
    for (const s of statements) expect(s).toMatch(/^revoke execute on function /i);
    expect(body).not.toMatch(/\b(drop|truncate|delete|update|insert)\b/i);
  });

  it("is idempotent", async () => { await asSuper(); await db.exec(migration); });

  it("leaves the deferred RLS-helper functions exactly as they were", async () => {
    const after = await aclSnapshot();
    for (const fn of DEFERRED) {
      const pick = (rows: string[]) => rows.filter((r) => r.startsWith(fn.replace(/\(uuid\)$/, "(")) || r.startsWith(fn.split("(")[0] + "(")).sort();
      expect(pick(after)).toEqual(pick(before));
    }
    expect(migration.replace(/--.*$/gm, "")).not.toMatch(/winsalot_is_(active|admin)_employee|crm_user_subcontractor_id/);
  });

  it("anon can no longer execute any of the 11 functions", async () => {
    await asRole("anon");
    await denied("select * from claim_due_crm_marketing_enrollments(10)");
    await denied("select * from claim_due_crm_retention_enrollments(10)");
    await denied("select * from claim_due_crm_retention_followups(10)");
    await denied("select next_provider_invoice_number()");
    await denied("select * from crm_subcontractor_visible_clients()");
    for (const f of ["crm_retention_cancel_on_client_archive", "leadgen_conversions_ensure_for_appointment", "winsalot_chat_enforce_edit_or_soft_delete_only", "winsalot_chat_enforce_soft_delete_only", "winsalot_dm_touch_conversation", "rls_auto_enable"]) {
      await denied(`select ${f}()`);
    }
  });

  it("signed-in users can no longer call the claim and trigger functions directly", async () => {
    await asRole("authenticated");
    await denied("select * from claim_due_crm_marketing_enrollments(10)");
    await denied("select * from claim_due_crm_retention_enrollments(10)");
    await denied("select * from claim_due_crm_retention_followups(10)");
    await denied("select crm_retention_cancel_on_client_archive()");
    await denied("select winsalot_dm_touch_conversation()");
  });

  it("server jobs (service_role) still claim due rows through the same functions", async () => {
    await asSuper();
    await db.exec(`insert into crm_marketing_enrollments(status,next_send_at) values ('active', now() - interval '1 hour');
      insert into crm_retention_enrollments(campaign_type,retention_status,next_send_at) values ('client_success','active', now() - interval '1 hour');
      insert into crm_retention_followups(auto_send,follow_up_date) values (true, current_date - 1);`);
    await asRole("service_role");
    expect((await db.query("select * from claim_due_crm_marketing_enrollments(10)")).rows).toHaveLength(1);
    expect((await db.query("select * from claim_due_crm_retention_enrollments(10)")).rows).toHaveLength(1);
    expect((await db.query("select * from claim_due_crm_retention_followups(10)")).rows).toHaveLength(1);
  });

  it("provider invoices still get their number for signed-in users and the server, not for anon", async () => {
    await asRole("authenticated");
    const a = await db.query<{ invoice_number: string }>("insert into provider_invoices(memo) values ('x') returning invoice_number");
    expect(a.rows[0].invoice_number).toMatch(/^INV-\d{4}-0001$/);
    await asRole("service_role");
    const b = await db.query<{ invoice_number: string }>("insert into provider_invoices(memo) values ('y') returning invoice_number");
    expect(b.rows[0].invoice_number).toMatch(/^INV-\d{4}-0002$/);
    await asRole("anon");
    await expect(db.query("insert into provider_invoices(memo) values ('z')")).rejects.toThrow(/permission denied/);
  });

  it("client archive still cancels retention emails (client records)", async () => {
    await asSuper();
    const { rows } = await db.query<{ id: string }>("insert into crm_clients(company_name,status) values ('Acme','Active') returning id");
    const client = rows[0].id;
    await db.exec(`insert into crm_retention_enrollments(client_id,campaign_type,retention_status,next_send_at) values ('${client}','client_success','active', now())`);
    await asRole("authenticated");
    await db.exec(`update crm_clients set status='Archived' where id='${client}'`);
    await asSuper();
    expect((await db.query<{ retention_status: string }>(`select retention_status from crm_retention_enrollments where client_id='${client}'`)).rows[0].retention_status).toBe("cancelled");
    expect((await db.query(`select 1 from crm_retention_events where client_id='${client}' and event_type='stopped'`)).rows).toHaveLength(1);
  });

  it("booking an appointment still creates its conversion record (appointments)", async () => {
    await asRole("authenticated");
    const { rows } = await db.query<{ id: string }>("insert into leadgen_appointments(client_id) values (gen_random_uuid()) returning id");
    await asSuper();
    expect((await db.query(`select 1 from leadgen_conversions where appointment_id='${rows[0].id}'`)).rows).toHaveLength(1);
  });

  it("chat edit / soft-delete / touch triggers still fire and still enforce their rules", async () => {
    await asSuper();
    const m = (await db.query<{ id: string }>("insert into crm_company_messages(content) values ('hi') returning id")).rows[0].id;
    const conv = (await db.query<{ id: string }>("insert into winsalot_dm_conversations default values returning id")).rows[0].id;
    const ann = (await db.query<{ id: string }>("insert into crm_announcements(content) values ('news') returning id")).rows[0].id;
    await asRole("authenticated");
    await db.exec(`update crm_company_messages set content='edited' where id='${m}'`);
    await asSuper();
    expect((await db.query<{ edited_at: string | null }>(`select edited_at from crm_company_messages where id='${m}'`)).rows[0].edited_at).not.toBeNull();
    await asRole("authenticated");
    await expect(db.query(`update crm_company_messages set sender_id=gen_random_uuid() where id='${m}'`)).rejects.toThrow(/Only editing your own message/);
    await expect(db.query(`update crm_announcements set content='tampered' where id='${ann}'`)).rejects.toThrow(/Only deletion/);
    await db.exec(`insert into crm_dm_messages(conversation_id, content, created_at) values ('${conv}','dm','2026-10-20T12:00:00Z')`);
    await asSuper();
    expect((await db.query<{ last_message_at: string | null }>(`select last_message_at from winsalot_dm_conversations where id='${conv}'`)).rows[0].last_message_at).not.toBeNull();
  });

  it("new tables still get row-level security automatically (event trigger needs no EXECUTE)", async () => {
    await asRole("migrator");
    await db.exec("create table public.zz_new_table(id int)");
    await asSuper();
    expect((await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname='zz_new_table'")).rows[0].relrowsecurity).toBe(true);
  });

  it("rollback restores the exact production EXECUTE grants", async () => {
    await asSuper();
    await db.exec(rollback);
    expect(await aclSnapshot()).toEqual(before);
    await db.exec(migration); // and the migration can be applied again afterwards
  });

  it("abort path: the self-check fails loudly if a grant slips through", async () => {
    await asSuper();
    await db.exec("grant execute on function public.rls_auto_enable() to anon");
    await expect(db.exec(migration.slice(migration.indexOf("do $$")))).rejects.toThrow(/anon can still execute/);
    await db.exec(migration);
  });
});

describe("code that calls the affected functions", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "node_modules" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
  const files = walk("src").filter((f) => !f.includes("__tests__"));
  const names = ["claim_due_crm_marketing_enrollments", "claim_due_crm_retention_enrollments", "claim_due_crm_retention_followups", "crm_subcontractor_visible_clients", "next_provider_invoice_number", "rls_auto_enable", "crm_retention_cancel_on_client_archive", "leadgen_conversions_ensure_for_appointment", "winsalot_dm_touch_conversation"];

  it("only server-side job code calls the claim_due_* functions, and only via the service-role client", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const n of names.filter((x) => x.startsWith("claim_due"))) {
        if (new RegExp(`rpc\\(\\s*["']${n}["']`).test(text)) {
          expect(["src/lib/crm-marketing-job.ts", "src/lib/crm-retention-job.ts"]).toContain(f);
          expect(text).toContain("getSupabaseAdmin");
          expect(text).not.toMatch(/createSupabaseServerClient|createBrowserClient/);
        }
      }
    }
  });

  it("no application code calls any of the other revoked functions over RPC", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const n of names.filter((x) => !x.startsWith("claim_due"))) expect(text).not.toMatch(new RegExp(`rpc\\(\\s*["']${n}["']`));
    }
  });
});

void uid; void ALL;
