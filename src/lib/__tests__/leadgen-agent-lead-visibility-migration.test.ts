import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Behavioral RLS test for 20261013000000: Henry-shaped data (campaign-less
// leads on an assigned client, Admin-scheduled follow-ups on his leads) must be
// visible to him, while another agent's and unassigned clients' records stay hidden.

const migration = readFileSync("supabase/migrations/20261013000000_leadgen_agent_campaignless_leads_and_owned_followups.sql", "utf8");
const db = new PGlite();
const henry = "00000000-0000-0000-0000-000000000001";
const goodness = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000003";
const tek = "10000000-0000-0000-0000-000000000001"; // Henry's assigned client
const brent = "10000000-0000-0000-0000-000000000002"; // not assigned to Henry
const tekCampaign = "20000000-0000-0000-0000-000000000001";
const brentCampaign = "20000000-0000-0000-0000-000000000002";

async function asUser(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
const ids = async (sql: string) => (await db.query<{ id: string }>(sql)).rows.map((r) => r.id).sort();

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table leadgen_users(id uuid primary key, role text, active boolean default true);
    create table leadgen_campaigns(id uuid primary key, client_id uuid);
    create table leadgen_campaign_agents(campaign_id uuid, agent_id uuid);
    create table leadgen_leads(id text primary key, client_id uuid, campaign_id uuid, assigned_agent_id uuid, status text default 'New');
    create table leadgen_followups(id text primary key, lead_id text, agent_id uuid, status text default 'pending');
    create function leadgen_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from leadgen_users where id=uid and active $$;
    -- verbatim from 20260930020000
    create function leadgen_agent_campaign_allowed(uid uuid, target_campaign_id uuid) returns boolean language sql security definer set search_path = public stable as $$
      select target_campaign_id is not null and exists (select 1 from public.leadgen_campaign_agents where agent_id = uid and campaign_id = target_campaign_id); $$;
    create function leadgen_agent_client_allowed(uid uuid, target_client_id uuid) returns boolean language sql security definer set search_path = public stable as $$
      select target_client_id is not null and exists (select 1 from public.leadgen_campaign_agents a join public.leadgen_campaigns c on c.id = a.campaign_id where a.agent_id = uid and c.client_id = target_client_id); $$;
    alter table leadgen_leads enable row level security; alter table leadgen_followups enable row level security;
    -- production policies BEFORE the migration
    create policy leadgen_leads_admin_all on leadgen_leads for all using (leadgen_user_role(auth.uid())='admin') with check (leadgen_user_role(auth.uid())='admin');
    create policy leadgen_leads_agent_select_own on leadgen_leads for select using (assigned_agent_id=auth.uid() and leadgen_user_role(auth.uid())='agent' and leadgen_agent_campaign_allowed(auth.uid(), campaign_id));
    create policy leadgen_leads_agent_update_own on leadgen_leads for update using (assigned_agent_id=auth.uid() and leadgen_user_role(auth.uid())='agent' and leadgen_agent_campaign_allowed(auth.uid(), campaign_id)) with check (assigned_agent_id=auth.uid() and leadgen_user_role(auth.uid())='agent' and leadgen_agent_campaign_allowed(auth.uid(), campaign_id));
    create policy leadgen_followups_admin_all on leadgen_followups for all using (leadgen_user_role(auth.uid())='admin') with check (leadgen_user_role(auth.uid())='admin');
    create policy leadgen_followups_agent_select_own on leadgen_followups for select using (agent_id=auth.uid() and leadgen_user_role(auth.uid())='agent' and (lead_id is null or exists (select 1 from leadgen_leads l where l.id=leadgen_followups.lead_id)));
    create policy leadgen_followups_agent_update_own on leadgen_followups for update using (agent_id=auth.uid() and leadgen_user_role(auth.uid())='agent' and (lead_id is null or exists (select 1 from leadgen_leads l where l.id=leadgen_followups.lead_id))) with check (agent_id=auth.uid() and leadgen_user_role(auth.uid())='agent');
    grant usage on schema auth to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;

    insert into leadgen_users values ('${henry}','agent'),('${goodness}','agent'),('${admin}','admin');
    insert into leadgen_campaigns values ('${tekCampaign}','${tek}'),('${brentCampaign}','${brent}');
    insert into leadgen_campaign_agents values ('${tekCampaign}','${henry}'),('${tekCampaign}','${goodness}');
    insert into leadgen_leads(id, client_id, campaign_id, assigned_agent_id, status) values
      ('h-tek-nocamp','${tek}',null,'${henry}','Interested'),
      ('h-tek-camp','${tek}','${tekCampaign}','${henry}','New'),
      ('h-brent-nocamp','${brent}',null,'${henry}','New'),
      ('g-tek-nocamp','${tek}',null,'${goodness}','Interested');
    insert into leadgen_followups(id, lead_id, agent_id) values
      ('f-admin-on-henry','h-tek-nocamp','${admin}'),
      ('f-admin-on-goodness','g-tek-nocamp','${admin}'),
      ('f-goodness-own','g-tek-nocamp','${goodness}'),
      ('f-admin-on-henry-brent','h-brent-nocamp','${admin}');`);
}, 30000);
beforeEach(async () => { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); });
afterAll(async () => { await db.close(); });

describe("before the migration (reproduces Henry's empty dashboard)", () => {
  it("Henry cannot see his campaign-less lead or the Admin-scheduled follow-up", async () => {
    await asUser(henry);
    expect(await ids("select id from leadgen_leads")).toEqual(["h-tek-camp"]);
    expect(await ids("select id from leadgen_followups")).toEqual([]);
  });
});

describe("after the migration", () => {
  beforeAll(async () => { await db.exec(`reset role; ${migration}`); });

  it("Henry sees his leads on assigned clients, with or without a campaign", async () => {
    await asUser(henry);
    expect(await ids("select id from leadgen_leads")).toEqual(["h-tek-camp", "h-tek-nocamp"]);
  });

  it("Henry still cannot see his lead on a client that is not assigned to him", async () => {
    await asUser(henry);
    expect(await ids("select id from leadgen_leads where id='h-brent-nocamp'")).toEqual([]);
    expect(await ids("select id from leadgen_followups where lead_id='h-brent-nocamp'")).toEqual([]);
  });

  it("Henry sees Admin-scheduled follow-ups on his leads, but not on other agents' leads", async () => {
    await asUser(henry);
    expect(await ids("select id from leadgen_followups")).toEqual(["f-admin-on-henry"]);
  });

  it("Henry can update his lead and complete the Admin-scheduled follow-up", async () => {
    await asUser(henry);
    expect((await db.query("update leadgen_leads set status='Interested' where id='h-tek-nocamp' returning id")).rows).toHaveLength(1);
    expect((await db.query("update leadgen_followups set status='completed' where id='f-admin-on-henry' returning id")).rows).toHaveLength(1);
  });

  it("Henry cannot touch another agent's lead or follow-ups", async () => {
    await asUser(henry);
    expect((await db.query("update leadgen_leads set status='Closed' where id='g-tek-nocamp' returning id")).rows).toHaveLength(0);
    expect((await db.query("update leadgen_followups set status='completed' where id in ('f-admin-on-goodness','f-goodness-own') returning id")).rows).toHaveLength(0);
  });

  it("Henry cannot hand his lead to another agent", async () => {
    await asUser(henry);
    await expect(db.query(`update leadgen_leads set assigned_agent_id='${goodness}' where id='h-tek-camp'`)).rejects.toThrow(/row-level security/);
  });

  it("Goodness sees only his own records, unchanged by the migration", async () => {
    await asUser(goodness);
    expect(await ids("select id from leadgen_leads")).toEqual(["g-tek-nocamp"]);
    expect(await ids("select id from leadgen_followups")).toEqual(["f-admin-on-goodness", "f-goodness-own"]);
  });

  it("an agent with no assigned client sees nothing", async () => {
    await db.exec(`reset role; delete from leadgen_campaign_agents where agent_id='${henry}'`);
    await asUser(henry);
    expect(await ids("select id from leadgen_leads")).toEqual([]);
    expect(await ids("select id from leadgen_followups")).toEqual([]);
  });

  it("Admin still sees and manages everything", async () => {
    await asUser(admin);
    expect((await ids("select id from leadgen_leads")).length).toBe(4);
    expect((await ids("select id from leadgen_followups")).length).toBe(4);
    expect((await db.query("update leadgen_leads set status='Closed' where id='g-tek-nocamp' returning id")).rows).toHaveLength(1);
  });
});
