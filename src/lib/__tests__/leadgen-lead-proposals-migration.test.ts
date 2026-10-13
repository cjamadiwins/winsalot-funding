import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Real-RLS test for 20261013190000: the migration is applied on top of a stand-in
// of the production tables/policies it relies on.

const migration = readFileSync("supabase/migrations/20261013190000_leadgen_lead_proposals.sql", "utf8");
const db = new PGlite();

const admin = "00000000-0000-0000-0000-000000000001";
const henry = "00000000-0000-0000-0000-000000000002";
const goodness = "00000000-0000-0000-0000-000000000003";
const otherAgent = "00000000-0000-0000-0000-000000000004";
const clientTekUser = "00000000-0000-0000-0000-000000000005";
const clientHidUser = "00000000-0000-0000-0000-000000000006";
const clientInactiveUser = "00000000-0000-0000-0000-000000000007";
const tek = "10000000-0000-0000-0000-000000000001";
const hid = "10000000-0000-0000-0000-000000000002";
const campTek = "20000000-0000-0000-0000-000000000001";
const campHid = "20000000-0000-0000-0000-000000000002";
const leadTek = "30000000-0000-0000-0000-000000000001";
const leadHid = "30000000-0000-0000-0000-000000000002";
const leadTekReset = "30000000-0000-0000-0000-000000000003";

async function asUser(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
const ids = async (sql: string) => (await db.query<{ lead_id: string }>(sql)).rows.map((r) => r.lead_id).sort();
const fingerprint = async () =>
  (
    await db.query(
      `select (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from leadgen_leads x) leads,
              (select md5(string_agg(to_jsonb(x)::text,'|' order by campaign_id, agent_id)) from leadgen_campaign_agents x) assignments,
              (select md5(string_agg(concat_ws('|', id, lead_id, notification_type, subject),';' order by id)) from leadgen_emails) emails,
              (select md5(string_agg(to_jsonb(x)::text,'|' order by id)) from leadgen_lead_activities x) activities`
    )
  ).rows;

let before: unknown;

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table leadgen_users(id uuid primary key, role text, active boolean default true, client_id uuid);
    create table leadgen_clients(id uuid primary key, name text);
    create table leadgen_campaigns(id uuid primary key, client_id uuid);
    create table leadgen_campaign_agents(campaign_id uuid, agent_id uuid);
    create table leadgen_leads(id uuid primary key, client_id uuid, campaign_id uuid, assigned_agent_id uuid);
    create table leadgen_emails(id uuid primary key default gen_random_uuid(), lead_id uuid, notification_type text, subject text);
    create table leadgen_lead_activities(id uuid primary key default gen_random_uuid(), lead_id uuid, activity_type text not null, notes text, call_outcome text,
      client_visible boolean not null default true, client_summary text);
    create function leadgen_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from leadgen_users where id=uid and active $$;
    create function leadgen_user_client_id(uid uuid) returns uuid language sql stable security definer set search_path = public as $$ select client_id from leadgen_users where id = uid and active and role = 'client' limit 1 $$;

    -- production activity constraint + summary trigger BEFORE this migration
    alter table leadgen_lead_activities add constraint leadgen_lead_activities_activity_type_check check (activity_type = ANY (ARRAY[
      'call','email','note','status_change','lead_assigned','lead_reassigned','follow_up_scheduled','follow_up_completed','appointment_booked','appointment_updated',
      'consultation_email_sent','consultation_invitation_sent','consultation_follow_up_sent','appointment_confirmation_resent','appointment_reminder_sent',
      'appointment_reminder_auto_sent','appointment_business_reminder_auto_sent','mantra_collab_intro_sent','web6_solutions_intro_sent','teknokraft_intro_sent',
      'hidebrandt_intro_sent','opportunity_created','opportunity_outcome_changed','client_notified','appointment_brief_sent']::text[]));
    create function set_leadgen_client_activity_summary() returns trigger language plpgsql set search_path to 'public' as $f$
    begin
      if new.activity_type in ('note','lead_assigned','lead_reassigned','client_notified') then new.client_visible := false; new.client_summary := null; return new; end if;
      new.client_visible := true;
      new.client_summary := case new.activity_type when 'call' then 'Call completed.' when 'appointment_brief_sent' then 'Appointment brief sent.' else 'Lead activity updated.' end;
      return new;
    end; $f$;
    create trigger leadgen_activity_client_summary before insert on leadgen_lead_activities for each row execute function set_leadgen_client_activity_summary();

    grant usage on schema auth to anon, authenticated, service_role;
    grant all on all tables in schema public to authenticated, service_role;

    insert into leadgen_clients values ('${tek}','Teknokraft'),('${hid}','Hidebrandt');
    insert into leadgen_users values ('${admin}','admin',true,null),('${henry}','agent',true,null),('${goodness}','agent',true,null),('${otherAgent}','agent',true,null),
      ('${clientTekUser}','client',true,'${tek}'),('${clientHidUser}','client',true,'${hid}'),('${clientInactiveUser}','client',false,'${tek}');
    insert into leadgen_campaigns values ('${campTek}','${tek}'),('${campHid}','${hid}');
    insert into leadgen_campaign_agents values ('${campTek}','${henry}'),('${campHid}','${goodness}');
    insert into leadgen_leads values ('${leadTek}','${tek}','${campTek}','${henry}'),('${leadHid}','${hid}','${campHid}','${goodness}'),('${leadTekReset}','${tek}','${campTek}','${henry}');
    insert into leadgen_emails(subject) values ('pre-existing email');
    insert into leadgen_lead_activities(lead_id, activity_type, notes) values ('${leadTek}','note','pre-existing note'),('${leadTek}','client_notified','pre-existing handoff');`);
  before = await fingerprint();
  await db.exec(migration);
  await db.exec(`reset role; insert into leadgen_lead_proposals(lead_id, client_id, status, request_count) values
    ('${leadTek}','${tek}','proposal_requested',1),('${leadHid}','${hid}','in_preparation',1),('${leadTekReset}','${tek}','not_requested',0);`);
}, 60000);
beforeEach(async () => { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); });
afterAll(async () => { await db.close(); });

describe("migration is additive", () => {
  it("leaves every existing lead, assignment, email and activity byte-identical", async () => {
    expect(await fingerprint()).toEqual(before);
  });
  it("adds the new email column as null on every existing email", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from leadgen_emails where request_key is not null");
    expect(rows[0].n).toBe(0);
  });
  it("can be applied twice without error", async () => {
    await expect(db.exec(migration)).resolves.not.toThrow();
  });
});

describe("who can read proposals (RLS)", () => {
  it("Admin sees all of them", async () => {
    await asUser(admin);
    expect(await ids("select lead_id from leadgen_lead_proposals")).toEqual([leadHid, leadTek, leadTekReset].sort());
  });

  it("a client sees only its OWN requested proposals - never another client's, never 'Not Requested'", async () => {
    await asUser(clientTekUser);
    expect(await ids("select lead_id from leadgen_lead_proposals")).toEqual([leadTek]);
    await asUser(clientHidUser);
    expect(await ids("select lead_id from leadgen_lead_proposals")).toEqual([leadHid]);
  });

  it("a deactivated client login sees nothing", async () => {
    await asUser(clientInactiveUser);
    expect(await ids("select lead_id from leadgen_lead_proposals")).toEqual([]);
  });

  it("an agent sees only proposals on leads assigned to them (read-only)", async () => {
    await asUser(henry);
    expect(await ids("select lead_id from leadgen_lead_proposals")).toEqual([leadTek, leadTekReset].sort());
    await asUser(goodness);
    expect(await ids("select lead_id from leadgen_lead_proposals")).toEqual([leadHid]);
    await asUser(otherAgent);
    expect(await ids("select lead_id from leadgen_lead_proposals")).toEqual([]);
  });

  it("anonymous access is denied outright", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from leadgen_lead_proposals")).rejects.toThrow(/permission denied/);
  });
});

describe("who can write proposals", () => {
  it("no signed-in role - Admin session, agent or client - can insert, update or delete directly", async () => {
    for (const user of [admin, henry, clientTekUser]) {
      await asUser(user);
      await expect(db.query(`insert into leadgen_lead_proposals(lead_id, client_id, status) values ('${leadTek}','${tek}','proposal_sent')`)).rejects.toThrow(/permission denied/);
      await expect(db.query("update leadgen_lead_proposals set status = 'proposal_sent'")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from leadgen_lead_proposals")).rejects.toThrow(/permission denied/);
    }
  });

  it("only the service role writes, one row per lead, with a valid status", async () => {
    await db.exec("reset role");
    await expect(db.query(`insert into leadgen_lead_proposals(lead_id, client_id) values ('${leadTek}','${tek}')`)).rejects.toThrow(/unique/);
    await expect(db.query(`update leadgen_lead_proposals set status = 'sent' where lead_id = '${leadTek}'`)).rejects.toThrow(/check/);
    const result = await db.query(`update leadgen_lead_proposals set status = 'in_preparation' where lead_id = '${leadTek}' returning status`);
    expect(result.rows).toEqual([{ status: "in_preparation" }]);
    await db.exec(`update leadgen_lead_proposals set status = 'proposal_requested' where lead_id = '${leadTek}'`);
  });
});

describe("double-send key on emails", () => {
  it("a request_key can be used once, while ordinary emails (no key) are unaffected", async () => {
    await db.exec("reset role");
    await db.exec(`insert into leadgen_emails(subject, request_key) values ('a', 'key-0000000000000001')`);
    await expect(db.query(`insert into leadgen_emails(subject, request_key) values ('b', 'key-0000000000000001')`)).rejects.toThrow(/unique/);
    await db.exec(`insert into leadgen_emails(subject) values ('no key 1'),('no key 2')`);
    await db.exec(`delete from leadgen_emails where subject in ('a','no key 1','no key 2')`);
  });
});

describe("activity types stay internal", () => {
  it("accepts the two new types and every existing one, and still rejects unknown ones", async () => {
    await db.exec("reset role");
    for (const type of ["proposal_requested", "proposal_status_changed", "client_notified", "appointment_brief_sent", "call"]) {
      await db.exec(`insert into leadgen_lead_activities(lead_id, activity_type) values ('${leadTek}','${type}')`);
    }
    await expect(db.query(`insert into leadgen_lead_activities(lead_id, activity_type) values ('${leadTek}','proposal_sent')`)).rejects.toThrow(/check/);
  });

  it("never mirrors proposal activity to the client; other activity still is", async () => {
    await db.exec("reset role");
    const rows = (await db.query<{ activity_type: string; client_visible: boolean; client_summary: string | null }>(
      "select activity_type, client_visible, client_summary from leadgen_lead_activities where lead_id = $1 order by activity_type", [leadTek]
    )).rows;
    const byType = Object.fromEntries(rows.map((r) => [r.activity_type, r]));
    expect(byType.proposal_requested).toMatchObject({ client_visible: false, client_summary: null });
    expect(byType.proposal_status_changed).toMatchObject({ client_visible: false, client_summary: null });
    expect(byType.client_notified).toMatchObject({ client_visible: false });
    expect(byType.note).toMatchObject({ client_visible: false });
    expect(byType.call).toMatchObject({ client_visible: true, client_summary: "Call completed." });
    expect(byType.appointment_brief_sent).toMatchObject({ client_visible: true, client_summary: "Appointment brief sent." });
  });
});
