import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Real-RLS check for 20261013170000 (review queue table) together with the
// production appointment policies it relies on for visibility.

const migration = readFileSync("supabase/migrations/20261013170000_leadgen_booking_review_queue.sql", "utf8");
const db = new PGlite();
const henry = "00000000-0000-0000-0000-000000000001";
const goodness = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000003";
const tek = "10000000-0000-0000-0000-000000000001";
const hid = "10000000-0000-0000-0000-000000000002";
const tekPest = "20000000-0000-0000-0000-000000000001";
const tekSnow = "20000000-0000-0000-0000-000000000002";
const hidWin = "20000000-0000-0000-0000-000000000003";

async function asUser(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
const ids = async (sql: string) => (await db.query<{ id: string }>(sql)).rows.map((r) => r.id).sort();
const assignments = async () => (await db.query("select campaign_id, agent_id from leadgen_campaign_agents order by campaign_id, agent_id")).rows;

let assignmentsBefore: unknown;

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table leadgen_users(id uuid primary key, role text, active boolean default true);
    create table leadgen_clients(id uuid primary key, name text);
    create table leadgen_campaigns(id uuid primary key, client_id uuid);
    create table leadgen_campaign_agents(campaign_id uuid, agent_id uuid);
    create table leadgen_leads(id text primary key, client_id uuid, campaign_id uuid, assigned_agent_id uuid);
    create table leadgen_appointments(id text primary key, lead_id text, client_id uuid, campaign_id uuid, assigned_specialist_id uuid);
    create function leadgen_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from leadgen_users where id=uid and active $$;
    create function leadgen_agent_campaign_allowed(uid uuid, target uuid) returns boolean language sql security definer set search_path = public stable as $$
      select target is not null and exists (select 1 from public.leadgen_campaign_agents where agent_id = uid and campaign_id = target); $$;
    alter table leadgen_appointments enable row level security;
    -- production appointment policies
    create policy leadgen_appointments_admin_all on leadgen_appointments for all using (leadgen_user_role(auth.uid())='admin') with check (leadgen_user_role(auth.uid())='admin');
    create policy leadgen_appointments_agent_select_own on leadgen_appointments for select using (leadgen_user_role(auth.uid())='agent' and leadgen_agent_campaign_allowed(auth.uid(), campaign_id) and (assigned_specialist_id = auth.uid() or exists (select 1 from leadgen_leads l where l.id = leadgen_appointments.lead_id and l.assigned_agent_id = auth.uid())));
    grant usage on schema auth to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;

    insert into leadgen_users values ('${henry}','agent'),('${goodness}','agent'),('${admin}','admin');
    insert into leadgen_clients values ('${tek}','Teknokraft'),('${hid}','Hidebrandt');
    insert into leadgen_campaigns values ('${tekPest}','${tek}'),('${tekSnow}','${tek}'),('${hidWin}','${hid}');
    insert into leadgen_campaign_agents values ('${tekPest}','${henry}'),('${tekSnow}','${henry}'),('${hidWin}','${goodness}');
    insert into leadgen_leads values ('henry-lead','${tek}','${tekPest}','${henry}'),('goodness-lead','${hid}','${hidWin}','${goodness}');
    insert into leadgen_appointments values
      ('appt-from-lead','henry-lead','${tek}','${tekPest}',null),
      ('appt-unassigned','henry-lead','${tek}',null,null),
      ('appt-goodness','goodness-lead','${hid}','${hidWin}',null);`);
  assignmentsBefore = await assignments();
  await db.exec(migration);
  await db.exec("grant select on public.leadgen_booking_review_queue to authenticated; grant all on public.leadgen_booking_review_queue to service_role;");
}, 30000);
beforeEach(async () => { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); });
afterAll(async () => { await db.close(); });

describe("appointment visibility follows the verified campaign", () => {
  it("an appointment filed under the lead's campaign is visible to the lead's agent and Admin only", async () => {
    await asUser(henry);
    expect(await ids("select id from leadgen_appointments")).toEqual(["appt-from-lead"]);
    await asUser(goodness);
    expect(await ids("select id from leadgen_appointments")).toEqual(["appt-goodness"]);
    await asUser(admin);
    expect((await ids("select id from leadgen_appointments")).length).toBe(3);
  });

  it("an unassigned appointment stays safely hidden from agents (Admin only) until a campaign is chosen", async () => {
    await asUser(henry);
    expect(await ids("select id from leadgen_appointments where id='appt-unassigned'")).toEqual([]);
    await asUser(goodness);
    expect(await ids("select id from leadgen_appointments where id='appt-unassigned'")).toEqual([]);
    await asUser(admin);
    expect(await ids("select id from leadgen_appointments where id='appt-unassigned'")).toEqual(["appt-unassigned"]);
    await db.exec(`reset role; update leadgen_appointments set campaign_id='${tekPest}' where id='appt-unassigned' and campaign_id is null`);
    await asUser(henry);
    expect(await ids("select id from leadgen_appointments where id='appt-unassigned'")).toEqual(["appt-unassigned"]);
    await asUser(goodness);
    expect(await ids("select id from leadgen_appointments where id='appt-unassigned'")).toEqual([]);
  });
});

describe("review queue table", () => {
  beforeAll(async () => {
    await db.exec(`reset role; insert into leadgen_booking_review_queue(source, reason, external_ref, payload) values ('calendly','client_not_matched','invitee-1','{"a":1}');`);
  });

  it("defaults to pending and is readable by Admin only", async () => {
    await asUser(admin);
    expect((await db.query("select status from leadgen_booking_review_queue")).rows).toEqual([{ status: "pending" }]);
    for (const agent of [henry, goodness]) {
      await asUser(agent);
      expect((await db.query("select * from leadgen_booking_review_queue")).rows).toHaveLength(0);
    }
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from leadgen_booking_review_queue")).rejects.toThrow(/permission denied/);
  });

  it("agents and Admin sessions cannot write it directly (only the service role can)", async () => {
    for (const user of [henry, admin]) {
      await asUser(user);
      await expect(db.query(`insert into leadgen_booking_review_queue(source, reason, external_ref, payload) values ('calendly','client_not_matched','x-${user}','{}')`)).rejects.toThrow(/row-level security|permission denied/);
      await expect(db.query("update leadgen_booking_review_queue set status='resolved' returning id")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from leadgen_booking_review_queue")).rejects.toThrow(/permission denied/);
    }
  });

  it("holds one row per Calendly booking and rejects unknown reasons", async () => {
    await db.exec("reset role");
    await expect(db.query(`insert into leadgen_booking_review_queue(source, reason, external_ref, payload) values ('calendly','client_not_matched','invitee-1','{}')`)).rejects.toThrow(/unique/);
    await expect(db.query(`insert into leadgen_booking_review_queue(source, reason, external_ref, payload) values ('calendly','bogus','invitee-2','{}')`)).rejects.toThrow(/check/);
  });
});

describe("the migration changes no assignments", () => {
  it("Henry stays on Teknokraft only and Goodness's assignment is untouched", async () => {
    expect(await assignments()).toEqual(assignmentsBefore);
    const henryClients = await db.query("select distinct c.client_id from leadgen_campaign_agents a join leadgen_campaigns c on c.id=a.campaign_id where a.agent_id=$1", [henry]);
    expect(henryClients.rows).toEqual([{ client_id: tek }]);
  });
});
