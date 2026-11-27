import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Real-RLS/function test for 20261029000000_sales_conversion_bonuses.sql,
// applied on top of a stand-in of the production tables it relies on.

const migration = readFileSync("supabase/migrations/20261029000000_sales_conversion_bonuses.sql", "utf8");
const db = new PGlite();

const admin = "00000000-0000-0000-0000-000000000001"; // Lead Gen admin
const growthAdmin = "00000000-0000-0000-0000-000000000002"; // Growth CRM admin only
const agentA = "00000000-0000-0000-0000-000000000003";
const agentB = "00000000-0000-0000-0000-000000000004";
const clientUser = "00000000-0000-0000-0000-000000000005";
const tek = "10000000-0000-0000-0000-000000000001";
const hid = "10000000-0000-0000-0000-000000000002";
const web6 = "10000000-0000-0000-0000-000000000003";
const leadTek = "30000000-0000-0000-0000-000000000001";
const leadHid = "30000000-0000-0000-0000-000000000002";
const leadWeb6 = "30000000-0000-0000-0000-000000000003";
const apptTek = "40000000-0000-0000-0000-000000000001";
const apptTekRebooked = "40000000-0000-0000-0000-000000000002";
const apptHid = "40000000-0000-0000-0000-000000000003";
const apptWeb6 = "40000000-0000-0000-0000-000000000004";
const apptCancelled = "40000000-0000-0000-0000-000000000005";
const apptNoAgent = "40000000-0000-0000-0000-000000000006";

async function asUser(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
const fingerprint = async () =>
  (
    await db.query(
      `select (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from leadgen_appointments x) appts,
              (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from leadgen_leads x) leads,
              (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from leadgen_payroll x) payroll,
              (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from crm_payroll x) growth_payroll`
    )
  ).rows;
const q = (sql: string, params?: unknown[]) => db.query<Record<string, unknown>>(sql, params);
const confirm = (id: string, notes: string | null = null) => q("select * from winsalot_confirm_sales_conversion($1, $2)", [id, notes]);
const bonusFor = async (appointmentId: string) =>
  (await db.query<Record<string, unknown>>("select * from winsalot_sales_conversion_bonuses where appointment_id = $1 order by created_at", [appointmentId])).rows;

let before: unknown;

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table leadgen_users(id uuid primary key, full_name text, email text, role text, active boolean default true, client_id uuid);
    create table crm_users(id uuid primary key, full_name text, email text, role text, active boolean default true);
    create table leadgen_clients(id uuid primary key, name text, slug text);
    create table leadgen_campaigns(id uuid primary key, client_id uuid);
    create table leadgen_leads(id uuid primary key, client_id uuid, business_name text, assigned_agent_id uuid);
    create table leadgen_appointments(id uuid primary key, client_id uuid, lead_id uuid, campaign_id uuid, business_name text, appointment_date date,
      status text, booking_agent_id uuid references leadgen_users(id));
    create table leadgen_payroll(id uuid primary key default gen_random_uuid(), agent_id uuid, base_pay_earned numeric, status text);
    create table crm_payroll(id uuid primary key default gen_random_uuid(), agent_id uuid, base_pay_earned numeric, status text);
    create function leadgen_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from leadgen_users where id=uid and active $$;
    create function crm_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from crm_users where id=uid and active $$;
    -- the real definitions live in 20261002204301_shared_payroll_register_access.sql
    create function winsalot_payroll_admin() returns boolean language sql stable security definer set search_path = '' as $$
      select exists(select 1 from public.crm_users where id = (select auth.uid()) and role = 'admin' and active)
          or exists(select 1 from public.leadgen_users where id = (select auth.uid()) and role = 'admin' and active) $$;
    create function winsalot_payroll_agent() returns boolean language sql stable security definer set search_path = '' as $$
      select exists(select 1 from public.crm_users where id = (select auth.uid()) and role = 'agent' and active)
          or exists(select 1 from public.leadgen_users where id = (select auth.uid()) and role = 'agent' and active) $$;

    insert into leadgen_users(id, full_name, email, role) values
      ('${admin}','Lead Gen Admin','admin@example.com','admin'),
      ('${agentA}','Agent A','a@example.com','agent'),
      ('${agentB}','Agent B','b@example.com','agent'),
      ('${clientUser}','Client','client@example.com','client');
    insert into crm_users(id, full_name, email, role) values ('${growthAdmin}','Growth Admin','growth@example.com','admin'), ('${agentA}','Agent A','a@example.com','agent');
    insert into leadgen_clients values ('${tek}','Teknokraft Canada Inc.','teknokraft-canada'),('${hid}','Hidebrandt Web Services','hidebrandt-web-services'),('${web6}','Web6 Solutions','web6-solutions');
    insert into leadgen_leads values ('${leadTek}','${tek}','Roofing Co','${agentA}'),('${leadHid}','${hid}','Snow Co','${agentB}'),('${leadWeb6}','${web6}','Other Co','${agentA}');
    insert into leadgen_appointments values
      ('${apptTek}','${tek}','${leadTek}',null,'Roofing Co','2026-10-20','Completed','${agentA}'),
      ('${apptTekRebooked}','${tek}','${leadTek}',null,'Roofing Co','2026-10-25','Booked','${agentA}'),
      ('${apptHid}','${hid}','${leadHid}',null,'Snow Co','2026-10-21','Completed','${agentB}'),
      ('${apptWeb6}','${web6}','${leadWeb6}',null,'Other Co','2026-10-22','Completed','${agentA}'),
      ('${apptCancelled}','${tek}',null,null,'Cancelled Co','2026-10-23','Cancelled','${agentA}'),
      ('${apptNoAgent}','${tek}',null,null,'Orphan Co','2026-10-24','Completed',null);
    insert into leadgen_payroll(agent_id, base_pay_earned, status) values ('${agentA}', 50000, 'paid');
    insert into crm_payroll(agent_id, base_pay_earned, status) values ('${agentA}', 75000, 'approved');`);
  before = await fingerprint();
  await db.exec("alter default privileges grant all on tables to authenticated, service_role");
  await db.exec(migration);
}, 30000);

beforeEach(async () => {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)");
});
afterAll(async () => {
  await db.close();
});

describe("programs", () => {
  it("seeds Teknokraft (client funded) and Hidebrandt (Winsalot funded) at CA$50, and nobody else", async () => {
    const { rows } = await db.query<{ slug: string; funding_model: string; bonus_amount: string; currency: string }>(
      "select c.slug, p.funding_model, p.bonus_amount, p.currency from winsalot_sales_bonus_programs p join leadgen_clients c on c.id = p.client_id order by c.slug"
    );
    expect(rows).toEqual([
      { slug: "hidebrandt-web-services", funding_model: "winsalot_funded", bonus_amount: "50.00", currency: "CAD" },
      { slug: "teknokraft-canada", funding_model: "client_funded", bonus_amount: "50.00", currency: "CAD" },
    ]);
  });
});

describe("sale confirmation", () => {
  it("lets only a Lead Gen Admin confirm a sale", async () => {
    for (const id of [agentA, clientUser, growthAdmin]) {
      await asUser(id);
      await expect(confirm(apptTek)).rejects.toThrow(/Only an Admin can confirm a sale/);
    }
    await db.exec("reset role; set role anon");
    await expect(confirm(apptTek)).rejects.toThrow(/permission denied/);
    await asUser(admin);
    expect((await db.query("select count(*)::int n from winsalot_sales_conversion_bonuses")).rows[0]).toEqual({ n: 0 });
  });

  it("calculates CA$50 for the credited agent and records Teknokraft as a client receivable", async () => {
    await asUser(admin);
    const { rows } = await confirm(apptTek, "Signed contract");
    expect(rows[0]).toMatchObject({
      agent_id: agentA, bonus_amount: "50.00", currency: "CAD", funding_model: "client_funded",
      accounting_treatment: "client_receivable", client_payment_status: "receivable", agent_payment_status: "pending",
      business_name: "Roofing Co", sale_confirmed_by: admin, sale_notes: "Signed contract",
    });
    expect(rows[0].paid_at).toBeNull();
  });

  it("records Hidebrandt as a Winsalot bonus expense with no client receivable", async () => {
    await asUser(admin);
    const { rows } = await confirm(apptHid);
    expect(rows[0]).toMatchObject({
      agent_id: agentB, bonus_amount: "50.00", funding_model: "winsalot_funded",
      accounting_treatment: "winsalot_bonus_expense", client_payment_status: "not_applicable", agent_payment_status: "pending",
    });
  });

  it("prevents a duplicate bonus for the same appointment", async () => {
    await asUser(admin);
    await expect(confirm(apptTek)).rejects.toThrow(/already exists for this sale/);
    expect(await bonusFor(apptTek)).toHaveLength(1);
  });

  it("prevents a second bonus when the same prospect is re-booked under another appointment", async () => {
    await asUser(admin);
    await expect(confirm(apptTekRebooked)).rejects.toThrow(/already exists for this sale/);
    expect(await bonusFor(apptTekRebooked)).toHaveLength(0);
  });

  it("enforces uniqueness in the database itself, not only in the function", async () => {
    await db.exec("reset role");
    await expect(
      db.query(
        `insert into winsalot_sales_conversion_bonuses(appointment_id, lead_id, client_id, agent_id, agent_name, agent_email, client_name, business_name,
          funding_model, accounting_treatment, bonus_amount, sale_confirmed_by_name, client_payment_status)
         values ($1, null, $2, $3, 'A', 'a@example.com', 'T', 'dup', 'client_funded', 'client_receivable', 50, 'x', 'receivable')`,
        [apptTek, tek, agentA]
      )
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects clients without a bonus program, cancelled appointments, and appointments with no credited agent", async () => {
    await asUser(admin);
    await expect(confirm(apptWeb6)).rejects.toThrow(/no active sales conversion bonus program/);
    await expect(confirm(apptCancelled)).rejects.toThrow(/Cancelled appointment cannot be confirmed/);
    await expect(confirm(apptNoAgent)).rejects.toThrow(/no credited agent/);
    await expect(confirm("99999999-0000-0000-0000-000000000000")).rejects.toThrow(/Appointment not found/);
  });

  it("cannot be written directly by anyone, including an Admin", async () => {
    for (const id of [admin, growthAdmin, agentA]) {
      await asUser(id);
      await expect(
        db.query(
          `insert into winsalot_sales_conversion_bonuses(client_id, agent_name, agent_email, client_name, business_name, funding_model, accounting_treatment, bonus_amount, sale_confirmed_by_name, client_payment_status)
           values ($1,'A','a@example.com','T','forged','winsalot_funded','winsalot_bonus_expense',9999,'x','not_applicable')`,
          [tek]
        )
      ).rejects.toThrow(/permission denied|row-level security/);
      await expect(db.query("update winsalot_sales_conversion_bonuses set bonus_amount = 9999")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from winsalot_sales_conversion_bonuses")).rejects.toThrow(/permission denied/);
    }
  });
});

describe("visibility", () => {
  it("shows every bonus to Admins of either CRM and none to clients or anonymous", async () => {
    for (const id of [admin, growthAdmin]) {
      await asUser(id);
      expect((await q("select * from winsalot_sales_conversion_bonuses")).rows).toHaveLength(2);
      expect((await q("select * from winsalot_sales_conversion_bonus_audit")).rows.length).toBeGreaterThan(0);
    }
    await asUser(clientUser);
    expect((await q("select * from winsalot_sales_conversion_bonuses")).rows).toHaveLength(0);
    expect((await q("select * from winsalot_my_sales_bonuses()")).rows).toHaveLength(0);
    await db.exec("reset role; set role anon");
    await expect(q("select * from winsalot_sales_conversion_bonuses")).rejects.toThrow(/permission denied/);
    await expect(q("select * from winsalot_my_sales_bonuses()")).rejects.toThrow(/permission denied/);
  });

  it("shows an agent only their own earned bonuses, without client billing fields", async () => {
    await asUser(agentA);
    expect((await q("select * from winsalot_sales_conversion_bonuses")).rows).toHaveLength(0);
    const { rows, fields } = await db.query<{ business_name: string; bonus_amount: string; agent_payment_status: string }>("select * from winsalot_my_sales_bonuses()");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ business_name: "Roofing Co", bonus_amount: "50.00", agent_payment_status: "pending" });
    const columns = fields.map((f) => f.name);
    for (const hidden of ["client_payment_status", "funding_model", "accounting_treatment", "client_payment_reference", "sale_notes", "agent_id"]) {
      expect(columns).not.toContain(hidden);
    }
    await asUser(agentB);
    expect((await db.query<{ business_name: string }>("select * from winsalot_my_sales_bonuses()")).rows.map((r) => r.business_name)).toEqual(["Snow Co"]);
  });
});

describe("approval and payment", () => {
  const bonusId = async (appointmentId: string) => (await bonusFor(appointmentId))[0].id as string;

  it("lets agents and clients do nothing with payment actions", async () => {
    await db.exec("reset role");
    const id = await bonusId(apptTek);
    for (const user of [agentA, clientUser]) {
      await asUser(user);
      await expect(q("select * from winsalot_approve_sales_bonus($1,'2026-11-06')", [id])).rejects.toThrow(/Only an Admin/);
      await expect(q("select * from winsalot_mark_sales_bonus_paid($1,'2026-10-01','ref')", [id])).rejects.toThrow(/Only an Admin/);
      await expect(q("select * from winsalot_void_sales_bonus($1,'why')", [id])).rejects.toThrow(/Only an Admin/);
      await expect(q("select * from winsalot_record_sales_bonus_client_payment($1,'2026-10-01')", [id])).rejects.toThrow(/Only an Admin/);
    }
  });

  it("cannot be marked paid before approval, and never becomes paid automatically", async () => {
    await db.exec("reset role");
    const id = await bonusId(apptTek);
    await asUser(admin);
    await expect(q("select * from winsalot_mark_sales_bonus_paid($1,'2026-10-01','ref-1')", [id])).rejects.toThrow(/Only an approved bonus/);
    expect((await bonusFor(apptTek))[0].agent_payment_status).toBe("pending");
  });

  it("approval needs a payroll payday and records who approved", async () => {
    await db.exec("reset role");
    const id = await bonusId(apptTek);
    await asUser(admin);
    await expect(q("select * from winsalot_approve_sales_bonus($1,null)", [id])).rejects.toThrow(/payroll payday/);
    const { rows } = await q("select * from winsalot_approve_sales_bonus($1,'2026-11-06')", [id]);
    expect(rows[0]).toMatchObject({ agent_payment_status: "approved", approved_by_name: "Lead Gen Admin" });
    expect((rows[0].payroll_payday as Date).toISOString().slice(0, 10)).toBe("2026-11-06");
    await expect(q("select * from winsalot_approve_sales_bonus($1,'2026-11-20')", [id])).rejects.toThrow(/Only a pending bonus/);
    expect(rows[0].paid_at).toBeNull();
  });

  it("tracks the client receivable separately from the agent payment", async () => {
    await db.exec("reset role");
    const id = await bonusId(apptTek);
    await asUser(growthAdmin);
    await expect(q("select * from winsalot_record_sales_bonus_client_payment($1,'2999-01-01')", [id])).rejects.toThrow(/not a future date/);
    const { rows } = await q("select * from winsalot_record_sales_bonus_client_payment($1,'2026-10-28','EFT-123')", [id]);
    expect(rows[0]).toMatchObject({ client_payment_status: "received", client_payment_reference: "EFT-123", agent_payment_status: "approved" });
    await expect(q("select * from winsalot_record_sales_bonus_client_payment($1,'2026-10-28')", [id])).rejects.toThrow(/No outstanding client receivable/);
    // Hidebrandt has no client leg.
    const hidId = await bonusId(apptHid);
    await expect(q("select * from winsalot_record_sales_bonus_client_payment($1,'2026-10-28')", [hidId])).rejects.toThrow(/No outstanding client receivable/);
  });

  it("marks paid only with a real date and reference, then freezes the record", async () => {
    await db.exec("reset role");
    const id = await bonusId(apptTek);
    await asUser(growthAdmin);
    await expect(q("select * from winsalot_mark_sales_bonus_paid($1,null,'ref')", [id])).rejects.toThrow(/date the payment was actually sent/);
    await expect(q("select * from winsalot_mark_sales_bonus_paid($1,'2999-01-01','ref')", [id])).rejects.toThrow(/date the payment was actually sent/);
    await expect(q("select * from winsalot_mark_sales_bonus_paid($1,'2026-10-28','  ')", [id])).rejects.toThrow(/payment reference is required/);
    const { rows } = await q("select * from winsalot_mark_sales_bonus_paid($1,'2026-10-28','E-TRANSFER-9')", [id]);
    expect(rows[0]).toMatchObject({ agent_payment_status: "paid", payment_reference: "E-TRANSFER-9", paid_by_name: "Growth Admin" });
    await expect(q("select * from winsalot_mark_sales_bonus_paid($1,'2026-10-28','again')", [id])).rejects.toThrow(/Only an approved bonus/);
    await expect(q("select * from winsalot_void_sales_bonus($1,'oops')", [id])).rejects.toThrow(/Only a pending or approved/);
    await db.exec("reset role");
    await expect(db.query("update winsalot_sales_conversion_bonuses set sale_notes = 'edit' where id = $1", [id])).rejects.toThrow(/can no longer be changed/);
    await expect(db.query("update winsalot_sales_conversion_bonuses set bonus_amount = 1 where id = $1", [await bonusId(apptHid)])).rejects.toThrow(/cannot be changed/);
  });

  it("agent sees the paid bonus and payment reference but never the client leg", async () => {
    await asUser(agentA);
    const { rows } = await db.query<{ agent_payment_status: string; payment_reference: string }>("select * from winsalot_my_sales_bonuses()");
    expect(rows).toEqual([expect.objectContaining({ agent_payment_status: "paid", payment_reference: "E-TRANSFER-9" })]);
  });

  it("voids need a reason, free the sale for a corrected confirmation, and keep the audited row", async () => {
    await db.exec("reset role");
    const id = await bonusId(apptHid);
    await asUser(admin);
    await expect(q("select * from winsalot_void_sales_bonus($1,' ')", [id])).rejects.toThrow(/reason is required/);
    const { rows } = await q("select * from winsalot_void_sales_bonus($1,'Prospect cancelled the sale')", [id]);
    expect(rows[0].agent_payment_status).toBe("voided");
    await asUser(agentB);
    expect((await q("select * from winsalot_my_sales_bonuses()")).rows).toHaveLength(0);
    await asUser(admin);
    expect((await confirm(apptHid)).rows[0].agent_payment_status).toBe("pending");
    expect(await bonusFor(apptHid)).toHaveLength(2);
  });
});

describe("audit and preservation", () => {
  it("keeps an append-only audit trail of every state change", async () => {
    await asUser(admin);
    const { rows } = await db.query<{ action: string }>("select action from winsalot_sales_conversion_bonus_audit order by occurred_at, id");
    expect(new Set(rows.map((r) => r.action))).toEqual(new Set(["sale_confirmed", "approved", "paid", "voided", "client_payment_received"]));
    await db.exec("reset role");
    await expect(db.query("update winsalot_sales_conversion_bonus_audit set performed_by_name = 'x'")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from winsalot_sales_conversion_bonus_audit")).rejects.toThrow(/append-only/);
  });

  it("survives deleting the source appointment", async () => {
    await db.exec("reset role");
    await db.exec(`delete from leadgen_appointments where id = '${apptTek}'`);
    const rows = (await db.query<{ appointment_id: string | null; business_name: string; agent_payment_status: string }>(
      "select appointment_id, business_name, agent_payment_status from winsalot_sales_conversion_bonuses where business_name = 'Roofing Co'")).rows;
    expect(rows).toEqual([{ appointment_id: null, business_name: "Roofing Co", agent_payment_status: "paid" }]);
  });

  it("leaves existing appointments, leads and both payroll tables exactly as they were", async () => {
    await db.exec("reset role");
    const after = await db.query(
      `select (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from leadgen_payroll x) payroll,
              (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from crm_payroll x) growth_payroll,
              (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from leadgen_leads x) leads`
    );
    const prior = (before as Record<string, unknown>[])[0];
    expect(after.rows[0]).toEqual({ payroll: prior.payroll, growth_payroll: prior.growth_payroll, leads: prior.leads });
  });
});
