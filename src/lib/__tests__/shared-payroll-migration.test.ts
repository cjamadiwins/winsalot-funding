import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = (name: string) => readFileSync(`supabase/migrations/${name}`, "utf8");
const db = new PGlite();
const agent = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000003";
const client = "00000000-0000-0000-0000-000000000004";
const inactive = "00000000-0000-0000-0000-000000000005";
const paid = "10000000-0000-0000-0000-000000000001";
const sharedMigration = migration("20261002204301_shared_payroll_register_access.sql");
let snapshot: unknown;
const fingerprint = async () => (await db.query("select (select jsonb_agg(to_jsonb(p) order by id) from crm_payroll p) as growth, (select jsonb_agg(to_jsonb(p) order by id) from leadgen_payroll p) as leadgen, (select jsonb_agg(to_jsonb(p) order by id) from crm_payroll_audit_log p) as growth_audit, (select jsonb_agg(to_jsonb(p) order by id) from leadgen_payroll_audit_log p) as leadgen_audit")).rows;
async function asUser(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table crm_users(id uuid primary key, full_name text, email text, role text, active boolean, payroll_currency text);
    create table leadgen_users(like crm_users including all);
    create function crm_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from crm_users where id=uid and active $$;
    create function leadgen_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from leadgen_users where id=uid and active $$;
    alter table crm_users enable row level security; alter table leadgen_users enable row level security;
    create policy own_read on crm_users for select using(id=auth.uid() or crm_user_role(auth.uid())='admin');
    create policy own_read on leadgen_users for select using(id=auth.uid() or leadgen_user_role(auth.uid())='admin');
    insert into crm_users values('${agent}','Agent','agent@example.com','agent',true,'NGN'),('${other}','Other','other@example.com','agent',true,'CAD'),('${admin}','Admin','admin@example.com','admin',true,'CAD'),('${client}','Client','client@example.com','client',true,'CAD'),('${inactive}','Inactive','inactive@example.com','agent',false,'NGN');
    insert into leadgen_users select * from crm_users where id <> '${admin}';`);
  for (const name of ["0054_crm_payroll.sql", "0055_leadgen_payroll.sql", "0063_payroll_attendance_integration.sql"]) await db.exec(migration(name));
  const hourly = migration("0075_attendance_breaks_hourly_payroll.sql");
  await db.exec(hourly.slice(hourly.indexOf("alter table public.crm_payroll")));
  const holiday = migration("0106_holiday_pay.sql");
  await db.exec(holiday.slice(holiday.indexOf("alter table public.crm_payroll"), holiday.indexOf("-- 5. Seed:")));
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
    insert into crm_payroll(id, agent_id, pay_period_start, pay_period_end, payday, base_pay_earned, internet_allowance, bonus_commission, status, actual_payment_date, payment_method, admin_notes, reopen_reason) values('${paid}','${agent}','2026-09-05','2026-09-18','2026-09-18',50000,25000,10000,'paid','2026-09-18','Bank Transfer','Thanks for your work','PRIVATE');
    insert into leadgen_payroll(agent_id, pay_period_start, pay_period_end, payday, base_pay_earned, status, actual_payment_date) values('${agent}','2026-09-19','2026-10-02','2026-10-02',50000,'paid','2026-10-02'),('${other}','2026-09-19','2026-10-02','2026-10-02',123.45,'paid','2026-10-02'),('${inactive}','2026-09-19','2026-10-02','2026-10-02',50000,'paid','2026-10-02');
    insert into crm_payroll_audit_log(payroll_id,agent_id,action,performed_by_name,reason) values('${paid}','${agent}','reopened','Admin','PRIVATE AUDIT');`);
  snapshot = await fingerprint();
  await db.exec("alter default privileges grant all on tables to authenticated, service_role");
  await db.exec(sharedMigration);
}, 30000);
beforeEach(async () => { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); });
afterAll(async () => { await db.close(); });
it("migration preserves every historical record and audit row exactly", async () => { expect(await fingerprint()).toEqual(snapshot); });
it("agent reads the same own history across both stores, never another agent", async () => {
  await asUser(agent);
  const { rows } = await db.query<{ agent_id: string; reopen_reason: string | null; source_crm: string }>("select agent_id,reopen_reason,source_crm from winsalot_payroll order by payday");
  expect(rows.map(r => r.agent_id)).toEqual([agent, agent]); expect(rows.map(r => r.source_crm)).toEqual(["growth", "leadgen"]); expect(rows.every(r => r.reopen_reason === null)).toBe(true);
  expect((await db.query("select * from winsalot_payroll_audit_log")).rows).toHaveLength(0);
});
it("Admin retrieves all history while preserving source-specific write permissions", async () => {
  await asUser(admin); expect((await db.query("select * from winsalot_payroll")).rows).toHaveLength(4);
  expect((await db.query("select * from winsalot_payroll_audit_log")).rows).toHaveLength(1);
  expect((await db.query("update leadgen_payroll set admin_notes='unauthorized' returning id")).rows).toHaveLength(0);
});
it("deduplicates employee identities without copying records", async () => { await asUser(admin); expect((await db.query("select * from winsalot_payroll_agents where id=$1", [agent])).rows).toHaveLength(1); });
it("anonymous, client, and inactive identities cannot read shared payroll", async () => {
  for (const id of [client, inactive]) { await asUser(id); expect((await db.query("select * from winsalot_payroll")).rows).toHaveLength(0); }
  await db.exec("reset role; set role anon"); await expect(db.query("select * from winsalot_payroll")).rejects.toThrow(/permission denied/);
});
it("agents cannot insert or edit payroll or audit rows", async () => {
  await asUser(agent); expect((await db.query("update crm_payroll set admin_notes='forged' returning id")).rows).toHaveLength(0);
  await expect(db.query("insert into crm_payroll(agent_id,pay_period_start,pay_period_end,payday) values($1,'2026-10-03','2026-10-16','2026-10-16')", [agent])).rejects.toThrow(/row-level security/);
  await expect(db.query("insert into crm_payroll_audit_log(payroll_id,agent_id,action,performed_by_name) values($1,$2,'created','Forged')", [paid, agent])).rejects.toThrow(/row-level security/);
});
it("blocks same-period creation in either CRM, including different payday", async () => {
  for (const table of ["crm_payroll", "leadgen_payroll"]) await expect(db.query(`insert into ${table}(agent_id,pay_period_start,pay_period_end,payday) values($1,'2026-09-19','2026-10-02','2026-10-03')`, [agent])).rejects.toThrow(/shared payroll record already exists/);
  expect(sharedMigration).toContain("pg_advisory_xact_lock");
});
it("preserves finalized payment protection and append-only audit", async () => {
  await asUser(admin); await expect(db.query("update crm_payroll set base_pay_earned=1 where id=$1", [paid])).rejects.toThrow(/Paid payroll records cannot be edited/);
  expect((await db.query("delete from crm_payroll_audit_log returning id")).rows).toHaveLength(0);
});
it("shared history views use caller RLS and expose no write API", async () => {
  const { rows } = await db.query<{ reloptions: string[] }>("select reloptions from pg_class where relname in ('winsalot_payroll','winsalot_payroll_audit_log','winsalot_payroll_agents')");
  expect(rows).toHaveLength(3); expect(rows.every(r => r.reloptions.includes("security_invoker=true"))).toBe(true);
  const privilege = await db.query<{ can_read: boolean; can_write: boolean }>("select has_table_privilege('authenticated','winsalot_payroll','select') as can_read, has_table_privilege('authenticated','winsalot_payroll','insert') as can_write");
  expect(privilege.rows[0]).toEqual({ can_read: true, can_write: false });
  await asUser(admin); await expect(db.query("delete from winsalot_payroll")).rejects.toThrow(/permission denied|cannot delete from view/);
});

it("reopening keeps the same record and blocks a second period record", async () => {
  await db.exec("begin");
  try {
    await db.query("update crm_payroll set status='draft', actual_payment_date=null, reopened_at=now(), reopen_reason='Reviewed correction' where id=$1", [paid]);
    expect((await db.query("select id from winsalot_payroll where id=$1", [paid])).rows).toHaveLength(1);
    await db.exec("savepoint duplicate_attempt");
    await expect(db.query("insert into leadgen_payroll(agent_id,pay_period_start,pay_period_end,payday,status) values($1,'2026-09-05','2026-09-18','2026-09-18','draft')", [agent])).rejects.toThrow(/shared payroll record already exists/);
    await db.exec("rollback to savepoint duplicate_attempt");
  } finally { await db.exec("rollback"); }
  expect(await fingerprint()).toEqual(snapshot);
});
it("migration stops for pre-existing duplicates instead of rewriting history", async () => {
  await db.exec("begin");
  try {
    await db.exec("drop trigger shared_payroll_period_guard on leadgen_payroll");
    await db.query("insert into leadgen_payroll(agent_id,pay_period_start,pay_period_end,payday,status) values($1,'2026-09-05','2026-09-18','2026-09-18','draft')", [agent]);
    const validation = sharedMigration.slice(sharedMigration.indexOf("do $$ begin"), sharedMigration.indexOf("-- Serialize checks"));
    await expect(db.exec(validation)).rejects.toThrow(/Duplicate historical payroll periods require review/);
  } finally { await db.exec("rollback"); }
  expect(await fingerprint()).toEqual(snapshot);
});
