import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Real-Postgres check (PGlite) of 20261103120000_leadgen_appointment_qualification.sql:
// seeding, legacy flagging, and the database-level qualification / approval rules.

const migration = readFileSync("supabase/migrations/20261103120000_leadgen_appointment_qualification.sql", "utf8");
const db = new PGlite();

const henry = "00000000-0000-0000-0000-000000000001";
const goodness = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000003";
const hid = "10000000-0000-0000-0000-000000000001";
const tek = "10000000-0000-0000-0000-000000000002";
const brent = "10000000-0000-0000-0000-000000000003";
const campHid = "20000000-0000-0000-0000-000000000001";
const campTek = "20000000-0000-0000-0000-000000000002";
const campBrent = "20000000-0000-0000-0000-000000000003";
const leadHid = "30000000-0000-0000-0000-000000000001"; // Goodness' Hidebrandt lead
const leadTek = "30000000-0000-0000-0000-000000000002"; // Henry's Teknokraft lead
const leadHid2 = "30000000-0000-0000-0000-000000000003";
const leadBrent = "30000000-0000-0000-0000-000000000004";
const clientUserHid = "00000000-0000-0000-0000-000000000004";
const clientUserTek = "00000000-0000-0000-0000-000000000005";

async function asUser(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
async function asService() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
}
async function rejects(sql: string, pattern: RegExp) {
  await expect(db.exec(sql)).rejects.toThrow(pattern);
}
const rows = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;

const goodQualification = (lead: string, client: string, camp: string, agent: string, extra = "") => `
  insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id, has_website, interested_in_new_or_redesign, satisfied_with_site,
    needs_ecommerce, interested_in_seo, challenges, understands_services, agreed_to_appointment, services_of_interest, outcome ${extra ? "," + extra.split("|")[0] : ""})
  values ('${lead}', '${client}', '${camp}', '${agent}', 'yes', 'redesign', 'not_satisfied', 'no', 'yes', 'Site is outdated and not mobile friendly', true, true,
    array['redesign_rebranding'], 'qualified' ${extra ? "," + extra.split("|")[1] : ""})`;

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table leadgen_users(id uuid primary key, role text, active boolean default true, client_id uuid);
    create table leadgen_clients(id uuid primary key, name text);
    create table leadgen_campaigns(id uuid primary key, client_id uuid);
    create table leadgen_campaign_agents(campaign_id uuid, agent_id uuid);
    create table leadgen_leads(id uuid primary key, client_id uuid, campaign_id uuid, assigned_agent_id uuid, notes text);
    create table leadgen_lead_activities(id uuid primary key default gen_random_uuid(), lead_id uuid, activity_type text, notes text);
    create table leadgen_appointments(id uuid primary key default gen_random_uuid(), lead_id uuid, client_id uuid, campaign_id uuid,
      assigned_specialist_id uuid, booking_agent_id uuid, appointment_notes text, status text not null default 'Booked', incentive_status text);
    create function leadgen_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from leadgen_users where id=uid and active $$;
    create function leadgen_agent_campaign_allowed(uid uuid, target uuid) returns boolean language sql security definer set search_path = public stable as $$
      select target is not null and exists (select 1 from public.leadgen_campaign_agents where agent_id = uid and campaign_id = target); $$;
    create function leadgen_agent_client_allowed(uid uuid, target uuid) returns boolean language sql security definer set search_path = public stable as $$
      select target is not null and exists (select 1 from public.leadgen_campaign_agents a join public.leadgen_campaigns c on c.id = a.campaign_id where a.agent_id = uid and c.client_id = target); $$;
    create table leadgen_conversions(id uuid primary key default gen_random_uuid(), appointment_id uuid, client_id uuid, note text);
    create function leadgen_user_client_id(uid uuid) returns uuid language sql stable security definer set search_path = public as $$ select client_id from leadgen_users where id=uid and role='client' $$;
    -- The production client policies this migration replaces (same conditions as live).
    alter table leadgen_appointments enable row level security;
    alter table leadgen_conversions enable row level security;
    create policy leadgen_appointments_admin_all on leadgen_appointments for all using (leadgen_user_role(auth.uid())='admin') with check (leadgen_user_role(auth.uid())='admin');
    create policy leadgen_appointments_agent_all on leadgen_appointments for all using (leadgen_user_role(auth.uid())='agent') with check (leadgen_user_role(auth.uid())='agent');
    create policy leadgen_appointments_client_select_own on leadgen_appointments for select using (client_id = leadgen_user_client_id(auth.uid()));
    create policy leadgen_conversions_client_select_own on leadgen_conversions for select using (client_id = leadgen_user_client_id(auth.uid()));
    create policy leadgen_conversions_client_update_own on leadgen_conversions for update using (client_id = leadgen_user_client_id(auth.uid())) with check (client_id = leadgen_user_client_id(auth.uid()));
    grant usage on schema auth to anon, authenticated, service_role;

    insert into leadgen_users values ('${henry}','agent',true,null),('${goodness}','agent',true,null),('${admin}','admin',true,null),('${clientUserHid}','client',true,'${hid}'),('${clientUserTek}','client',true,'${tek}');
    insert into leadgen_clients values ('${hid}','Hidebrandt Web Services'),('${tek}','Teknokraft Canada Inc.'),('${brent}','Brent''s Essentials');
    insert into leadgen_campaigns values ('${campHid}','${hid}'),('${campTek}','${tek}'),('${campBrent}','${brent}');
    insert into leadgen_campaign_agents values ('${campHid}','${goodness}'),('${campTek}','${henry}'),('${campBrent}','${henry}');
    insert into leadgen_leads values
      ('${leadHid}','${hid}','${campHid}','${goodness}','Interested'),
      ('${leadHid2}','${hid}','${campHid}','${goodness}',null),
      ('${leadTek}','${tek}','${campTek}','${henry}','Interested and want a call'),
      ('${leadBrent}','${brent}','${campBrent}','${henry}',null);
    -- Appointments that exist BEFORE the migration (mirrors real examples).
    insert into leadgen_appointments (id, lead_id, client_id, campaign_id, assigned_specialist_id, booking_agent_id, appointment_notes, status) values
      ('40000000-0000-0000-0000-000000000001','${leadHid}','${hid}','${campHid}','${goodness}','${goodness}','The client has expressed interest in SEO services and rebranding their existing website.','Booked'),
      ('40000000-0000-0000-0000-000000000002','${leadHid}','${hid}','${campHid}','${goodness}','${goodness}','Hassan is interested in lead generation and wants to know how much it would cost him','Booked'),
      ('40000000-0000-0000-0000-000000000003','${leadHid2}','${hid}','${campHid}','${goodness}','${goodness}','Emmanuel is interested in lead generation and website design','Booked'),
      ('40000000-0000-0000-0000-000000000004','${leadTek}','${tek}','${campTek}','${henry}','${henry}','Bailey is interested and wants a call by 2:30 tomorrow.','Booked'),
      ('40000000-0000-0000-0000-000000000005','${leadTek}','${tek}','${campTek}','${henry}','${henry}',null,'Cancelled'),
      ('40000000-0000-0000-0000-000000000006','${leadBrent}','${brent}','${campBrent}','${henry}','${henry}','Wants cold calling help','Booked');
    insert into leadgen_conversions (appointment_id, client_id) select id, client_id from leadgen_appointments;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;`);
  await db.exec(migration);
}, 60000);

beforeEach(asService);
afterAll(async () => { await db.close(); });

describe("migration safety and seeding", () => {
  it("leaves every pre-existing appointment untouched and not subject to the new process", async () => {
    const all = await rows<{ id: string; status: string; qc_status: string; incentive_status: string | null }>("select id, status, qc_status, incentive_status from leadgen_appointments order by id");
    expect(all).toHaveLength(6);
    expect(all.every((a) => a.qc_status === "not_required")).toBe(true);
    expect(all.map((a) => a.status)).toEqual(["Booked", "Booked", "Booked", "Booked", "Cancelled", "Booked"]);
    expect(all.every((a) => a.incentive_status === null)).toBe(true);
  });

  it("seeds separate, different service lists for the two clients and leaves other clients ungated", async () => {
    const s = await rows<{ name: string; enabled: boolean; approved_services: string[] }>(
      "select c.name, s.enabled, s.approved_services from leadgen_client_qualification_settings s join leadgen_clients c on c.id = s.client_id order by c.name"
    );
    expect(s.map((r) => r.name)).toEqual(["Hidebrandt Web Services", "Teknokraft Canada Inc."]);
    const hidSettings = s.find((r) => r.name.startsWith("Hidebrandt"))!;
    const tekSettings = s.find((r) => r.name.startsWith("Teknokraft"))!;
    expect(hidSettings.approved_services).toEqual(expect.arrayContaining(["new_website", "redesign_rebranding", "ecommerce", "seo_visibility", "human_search_optimization"]));
    expect(tekSettings.approved_services).toEqual(["new_website", "redesign_rebranding", "seo_visibility"]);
    expect(tekSettings.approved_services).not.toContain("ecommerce");
  });

  it("flags only legacy appointments with unclear website interest, with the right reason", async () => {
    const flags = await rows<{ appointment_id: string; reason: string; review_status: string }>("select appointment_id, reason, review_status from leadgen_appointment_legacy_flags order by appointment_id");
    const byId = Object.fromEntries(flags.map((f) => [f.appointment_id.slice(-1), f.reason]));
    expect(Object.keys(byId).sort()).toEqual(["2", "3", "4"]); // not #1 (SEO/rebrand), #5 (cancelled), #6 (ungated client)
    expect(byId["2"]).toMatch(/lead generation \/ cold calling, not website/);
    expect(byId["3"]).toMatch(/Mixed interest/);
    expect(byId["4"]).toMatch(/No documented interest/);
    expect(flags.every((f) => f.review_status === "open")).toBe(true);
  });
});

describe("qualification rules enforced by the database", () => {
  it("rejects 'qualified' when a required answer is missing", async () => {
    await rejects(
      `insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id, has_website, services_of_interest, outcome)
       values ('${leadHid}','${hid}','${campHid}','${goodness}','yes', array['redesign_rebranding'], 'qualified')`,
      /qualification_incomplete/
    );
  });

  it("rejects 'qualified' when the prospect wants lead generation only, even with every answer filled in", async () => {
    await rejects(goodQualification(leadHid, hid, campHid, goodness, "lead_gen_only|true"), /qualification_not_allowed/);
  });

  it("rejects 'qualified' when the prospect has not agreed to the appointment or does not understand the service", async () => {
    await rejects(goodQualification(leadHid, hid, campHid, goodness).replace("true, true,", "true, false,"), /qualification_incomplete/);
    await rejects(goodQualification(leadHid, hid, campHid, goodness).replace("true, true,", "false, true,"), /qualification_incomplete/);
  });

  it("rejects a service the client has not had approved (Teknokraft e-commerce) and unknown service keys", async () => {
    await rejects(goodQualification(leadTek, tek, campTek, henry).replace("redesign_rebranding", "ecommerce"), /qualification_incomplete/);
    await rejects(goodQualification(leadTek, tek, campTek, henry).replace("redesign_rebranding", "cold_calling"), /qualification_invalid_service/);
  });

  it("accepts a complete qualification and keeps one record per lead", async () => {
    await db.exec(goodQualification(leadHid, hid, campHid, goodness));
    const q = await rows<{ outcome: string; submitted_at: string | null }>(`select outcome, submitted_at from leadgen_lead_qualifications where lead_id='${leadHid}'`);
    expect(q[0].outcome).toBe("qualified");
    expect(q[0].submitted_at).not.toBeNull();
    await rejects(goodQualification(leadHid, hid, campHid, goodness), /unique|duplicate/);
  });

  it("forces the lead-generation-only category and never lets a draft claim qualified", async () => {
    await db.exec(`insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id, lead_gen_only, outcome, category)
      values ('${leadHid2}','${hid}','${campHid}','${goodness}', true, 'not_qualified', 'seo_visibility')`);
    const q = await rows<{ category: string }>(`select category from leadgen_lead_qualifications where lead_id='${leadHid2}'`);
    expect(q[0].category).toBe("not_qualified_lead_gen_only");
  });
});

describe("rules apply separately to Hidebrandt and Teknokraft", () => {
  const ecommerceOnly = (lead: string, client: string, camp: string, agent: string) => `
    insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id, has_website, interested_in_new_or_redesign, satisfied_with_site,
      needs_ecommerce, interested_in_seo, challenges, understands_services, agreed_to_appointment, services_of_interest, outcome)
    values ('${lead}', '${client}', '${camp}', '${agent}', 'no', 'neither', 'not_applicable', 'yes', 'no', 'Wants an online store', true, true, array['ecommerce'], 'qualified')`;

  it("identical e-commerce-only answers are Qualified for Hidebrandt but rejected for Teknokraft", async () => {
    await asService();
    // Fresh leads so earlier tests' rows do not interfere.
    const hidLead = "30000000-0000-0000-0000-0000000000a1";
    const tekLead = "30000000-0000-0000-0000-0000000000a2";
    await db.exec(`insert into leadgen_leads values ('${hidLead}','${hid}','${campHid}','${goodness}',null), ('${tekLead}','${tek}','${campTek}','${henry}',null)`);
    await db.exec(ecommerceOnly(hidLead, hid, campHid, goodness));
    await rejects(ecommerceOnly(tekLead, tek, campTek, henry), /qualification_incomplete/);
    // Once Admin confirms Teknokraft offers e-commerce, the same answers pass - and Hidebrandt is unaffected.
    await db.exec(`update leadgen_client_qualification_settings set approved_services = approved_services || array['ecommerce'] where client_id='${tek}'`);
    await db.exec(ecommerceOnly(tekLead, tek, campTek, henry));
    expect((await rows<{ approved_services: string[] }>(`select approved_services from leadgen_client_qualification_settings where client_id='${hid}'`))[0].approved_services).toContain("ecommerce");
    await db.exec(`update leadgen_client_qualification_settings set approved_services = array_remove(approved_services, 'ecommerce') where client_id='${tek}'`);
    await db.exec(`delete from leadgen_lead_qualifications where lead_id in ('${hidLead}','${tekLead}'); delete from leadgen_leads where id in ('${hidLead}','${tekLead}')`);
  });

  it("turning one client's requirement off does not change the other client's", async () => {
    await asService();
    await db.exec(`update leadgen_client_qualification_settings set enabled=false where client_id='${tek}'`);
    const tekAppt = await db.query<{ id: string }>(`insert into leadgen_appointments (client_id, campaign_id, appointment_notes) values ('${tek}','${campTek}','tek ungated now') returning id`);
    const hidAppt = await db.query<{ id: string }>(`insert into leadgen_appointments (client_id, campaign_id, appointment_notes) values ('${hid}','${campHid}','hid still gated') returning id`);
    const status = async (id: string) => (await rows<{ qc_status: string }>(`select qc_status from leadgen_appointments where id='${id}'`))[0].qc_status;
    expect(await status(tekAppt.rows[0].id)).toBe("not_required");
    expect(await status(hidAppt.rows[0].id)).toBe("pending_review");
    await db.exec(`update leadgen_client_qualification_settings set enabled=true where client_id='${tek}'`);
    await db.exec(`delete from leadgen_appointments where id in ('${tekAppt.rows[0].id}','${hidAppt.rows[0].id}')`);
  });
});

describe("appointment approval enforced by the database", () => {
  const newAppt = (lead: string, client: string, camp: string, agent: string, extra = "") =>
    `insert into leadgen_appointments (lead_id, client_id, campaign_id, assigned_specialist_id, booking_agent_id, appointment_notes ${extra ? ", " + extra.split("|")[0] : ""})
     values ('${lead}','${client}','${camp}','${agent}','${agent}','new' ${extra ? ", " + extra.split("|")[1] : ""}) returning id`;

  it("starts gated-client appointments pending and ignores any value the caller passes", async () => {
    const forced = await db.query<{ id: string }>(newAppt(leadHid, hid, campHid, goodness, "qc_status|'approved'"));
    const [row] = await rows<{ qc_status: string; qc_submitted_at: string | null }>(`select qc_status, qc_submitted_at from leadgen_appointments where id='${forced.rows[0].id}'`);
    expect(row.qc_status).toBe("pending_review");
    expect(row.qc_submitted_at).not.toBeNull();
    const ungated = await db.query<{ id: string }>(newAppt(leadBrent, brent, campBrent, henry, "qc_status|'pending_review'"));
    const [row2] = await rows<{ qc_status: string }>(`select qc_status from leadgen_appointments where id='${ungated.rows[0].id}'`);
    expect(row2.qc_status).toBe("not_required");
  });

  it("a signed-in agent cannot submit an appointment for a gated client without a qualified qualification", async () => {
    const insert = (qualification: string) => `insert into leadgen_appointments (lead_id, client_id, campaign_id, assigned_specialist_id, booking_agent_id, qualification_id, appointment_notes)
      values ('${leadHid2}','${hid}','${campHid}','${goodness}','${goodness}', ${qualification}, 'agent submit test')`;
    await asUser(goodness);
    await rejects(insert("null"), /qc_qualification_required/);
    // A qualification for a different lead does not count either.
    await asService();
    const other = await rows<{ id: string }>(`select id from leadgen_lead_qualifications where lead_id='${leadHid}'`);
    await asUser(goodness);
    await rejects(insert(`'${other[0].id}'`), /qc_qualification_required/);
    // An unqualified draft does not count.
    await asService();
    await db.exec(`update leadgen_lead_qualifications set outcome='not_qualified' where lead_id='${leadHid2}'`);
    const draft = await rows<{ id: string }>(`select id from leadgen_lead_qualifications where lead_id='${leadHid2}'`);
    await asUser(goodness);
    await rejects(insert(`'${draft[0].id}'`), /qc_qualification_required/);
    expect(await rows("select id from leadgen_appointments where appointment_notes='agent submit test'")).toEqual([]);
  });

  it("allows the same agent to submit once the lead is properly qualified, and keeps system bookings pending", async () => {
    await asService();
    await db.exec(`update leadgen_lead_qualifications set outcome='qualified' where lead_id='${leadHid}'`);
    const q = await rows<{ id: string }>(`select id from leadgen_lead_qualifications where lead_id='${leadHid}'`);
    await asUser(goodness);
    await db.exec(`insert into leadgen_appointments (lead_id, client_id, campaign_id, assigned_specialist_id, booking_agent_id, qualification_id, appointment_notes)
      values ('${leadHid}','${hid}','${campHid}','${goodness}','${goodness}','${q[0].id}', 'agent submit ok')`);
    expect((await rows<{ qc_status: string }>("select qc_status from leadgen_appointments where appointment_notes='agent submit ok'"))[0].qc_status).toBe("pending_review");
    // Service-role system booking (public page / Calendly): no signed-in user, held as pending without a qualification.
    await asService();
    await db.exec(`insert into leadgen_appointments (lead_id, client_id, campaign_id, appointment_notes) values (null,'${hid}','${campHid}','self booked')`);
    expect((await rows<{ qc_status: string }>("select qc_status from leadgen_appointments where appointment_notes='self booked'"))[0].qc_status).toBe("pending_review");
  });

  it("an agent session cannot change review state; Admin must", async () => {
    const { rows: [appt] } = await db.query<{ id: string }>(newAppt(leadHid, hid, campHid, goodness));
    await asUser(goodness);
    await rejects(`update leadgen_appointments set qc_status='approved', qc_reviewed_by='${admin}' where id='${appt.id}'`, /qc_forbidden/);
    await rejects(`update leadgen_appointments set qc_admin_feedback='self-approved' where id='${appt.id}'`, /qc_forbidden/);
  });

  it("cannot be approved without a complete qualification linked to the same lead and client", async () => {
    const { rows: [appt] } = await db.query<{ id: string }>(newAppt(leadHid, hid, campHid, goodness));
    await rejects(`update leadgen_appointments set qc_status='approved', qc_reviewed_by='${admin}' where id='${appt.id}'`, /qc_not_qualified/);
    const q = await rows<{ id: string }>(`select id from leadgen_lead_qualifications where lead_id='${leadHid}'`);
    // A qualification for a different lead does not count.
    await db.exec(goodQualification(leadTek, tek, campTek, henry));
    const other = await rows<{ id: string }>(`select id from leadgen_lead_qualifications where lead_id='${leadTek}'`);
    await rejects(`update leadgen_appointments set qc_status='approved', qualification_id='${other[0].id}', qc_reviewed_by='${admin}' where id='${appt.id}'`, /qc_not_qualified/);
    // The reviewer must be an Admin.
    await rejects(`update leadgen_appointments set qc_status='approved', qualification_id='${q[0].id}', qc_reviewed_by='${goodness}' where id='${appt.id}'`, /qc_reviewer_required/);
    await db.exec(`update leadgen_appointments set qc_status='approved', qualification_id='${q[0].id}', qc_reviewed_by='${admin}' where id='${appt.id}'`);
    const [after] = await rows<{ qc_status: string; qc_reviewed_at: string | null }>(`select qc_status, qc_reviewed_at from leadgen_appointments where id='${appt.id}'`);
    expect(after.qc_status).toBe("approved");
    expect(after.qc_reviewed_at).not.toBeNull();
  });

  it("requires a reason to reject and feedback to request more qualification; follows the allowed transitions", async () => {
    const { rows: [appt] } = await db.query<{ id: string }>(newAppt(leadHid2, hid, campHid, goodness));
    await rejects(`update leadgen_appointments set qc_status='rejected', qc_reviewed_by='${admin}' where id='${appt.id}'`, /qc_reason_required/);
    await rejects(`update leadgen_appointments set qc_status='needs_info', qc_reviewed_by='${admin}' where id='${appt.id}'`, /qc_feedback_required/);
    await db.exec(`update leadgen_appointments set qc_status='needs_info', qc_admin_feedback='Confirm they want a website, not lead gen', qc_reviewed_by='${admin}' where id='${appt.id}'`);
    await db.exec(`update leadgen_appointments set qc_status='pending_review' where id='${appt.id}'`);
    await db.exec(`update leadgen_appointments set qc_status='rejected', qc_rejection_reason='Wants cold calling only', qc_reviewed_by='${admin}' where id='${appt.id}'`);
    await rejects(`update leadgen_appointments set qc_status='approved', qc_reviewed_by='${admin}' where id='${appt.id}'`, /qc_invalid_transition/);
    await rejects(`update leadgen_appointments set qc_status='pending_review' where id='${appt.id}'`, /qc_invalid_transition/);
  });

  it("logs every submission, request, resubmission and decision automatically", async () => {
    const { rows: [appt] } = await db.query<{ id: string }>(newAppt(leadHid2, hid, campHid, goodness));
    await db.exec(`update leadgen_appointments set qc_status='needs_info', qc_admin_feedback='more please', qc_reviewed_by='${admin}' where id='${appt.id}'`);
    await db.exec(`update leadgen_appointments set qc_status='pending_review' where id='${appt.id}'`);
    await db.exec(`update leadgen_appointments set qc_status='rejected', qc_rejection_reason='Not interested in websites', qc_reviewed_by='${admin}' where id='${appt.id}'`);
    const log = await rows<{ action: string; agent_id: string; reason: string | null }>(`select action, agent_id, reason from leadgen_appointment_qc_reviews where appointment_id='${appt.id}' order by created_at, id`);
    expect(log.map((l) => l.action).sort()).toEqual(["needs_info", "rejected", "resubmitted", "submitted"]);
    expect(log.every((l) => l.agent_id === goodness)).toBe(true);
    expect(log.find((l) => l.action === "rejected")?.reason).toBe("Not interested in websites");
  });

  it("an approved appointment's qualification is locked for agents", async () => {
    const q = await rows<{ id: string }>(`select id from leadgen_lead_qualifications where lead_id='${leadHid}'`);
    await asUser(goodness);
    await rejects(`update leadgen_lead_qualifications set challenges='changed' where id='${q[0].id}'`, /qualification_locked/);
  });
});

describe("row level security", () => {
  it("agents only see and write qualifications for their own leads", async () => {
    await asUser(henry);
    expect((await rows<{ lead_id: string }>("select lead_id from leadgen_lead_qualifications")).map((r) => r.lead_id)).toEqual([leadTek]);
    await rejects(
      `insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id) values ('${leadHid2}','${hid}','${campHid}','${henry}')`,
      /row-level security|violates/
    );
    await asUser(goodness);
    expect((await rows<{ lead_id: string }>("select lead_id from leadgen_lead_qualifications order by lead_id")).map((r) => r.lead_id)).toEqual([leadHid, leadHid2]);
  });

  it("agents can read settings only for clients they work for; legacy flags are Admin-only", async () => {
    await asUser(henry);
    expect((await rows<{ client_id: string }>("select client_id from leadgen_client_qualification_settings")).map((r) => r.client_id)).toEqual([tek]);
    expect(await rows("select * from leadgen_appointment_legacy_flags")).toEqual([]);
    await asUser(admin);
    expect((await rows("select * from leadgen_appointment_legacy_flags")).length).toBe(3);
    expect((await rows("select * from leadgen_client_qualification_settings")).length).toBe(2);
  });

  it("agents cannot write the review log or settings", async () => {
    await asUser(goodness);
    await expect(db.exec(`insert into leadgen_appointment_qc_reviews (appointment_id, client_id, action) select id, client_id, 'approved' from leadgen_appointments limit 1`)).rejects.toThrow(/permission denied/);
    await expect(db.exec(`update leadgen_client_qualification_settings set enabled=false`)).rejects.toThrow(/permission denied/);
  });
});

describe("clients never see an appointment, or its conversion row, before it is approved", () => {
  const newAppt = async (lead: string, client: string, camp: string, agent: string) => {
    const r = await db.query<{ id: string }>(`insert into leadgen_appointments (lead_id, client_id, campaign_id, assigned_specialist_id, booking_agent_id, appointment_notes)
      values ('${lead}','${client}','${camp}','${agent}','${agent}','client visibility test') returning id`);
    await db.exec(`insert into leadgen_conversions (appointment_id, client_id) values ('${r.rows[0].id}','${client}')`); // what the existing trigger does
    return r.rows[0].id;
  };
  const visibleAppts = async () => (await rows<{ id: string }>("select id from leadgen_appointments where appointment_notes = 'client visibility test'")).map((r) => r.id);

  it("still shows a client its existing (pre-process) appointments and conversions", async () => {
    await asUser(clientUserHid);
    const seen = await rows<{ id: string; qc_status: string }>("select id, qc_status from leadgen_appointments");
    for (const legacyId of ["40000000-0000-0000-0000-000000000001", "40000000-0000-0000-0000-000000000002", "40000000-0000-0000-0000-000000000003"]) {
      expect(seen.map((r) => r.id)).toContain(legacyId);
    }
    expect(seen.every((r) => r.qc_status === "not_required" || r.qc_status === "approved")).toBe(true);
    const conversions = await rows<{ appointment_id: string }>("select appointment_id from leadgen_conversions");
    expect(conversions.map((r) => r.appointment_id)).toEqual(expect.arrayContaining(["40000000-0000-0000-0000-000000000001", "40000000-0000-0000-0000-000000000002"]));
    await asUser(clientUserTek);
    expect((await rows<{ id: string }>("select id from leadgen_appointments")).map((r) => r.id)).toEqual(expect.arrayContaining(["40000000-0000-0000-0000-000000000004", "40000000-0000-0000-0000-000000000005"]));
  });

  it("hides a pending appointment and its conversion row from its own client", async () => {
    await asService();
    const id = await newAppt(leadHid, hid, campHid, goodness);
    await asUser(clientUserHid);
    expect(await visibleAppts()).toEqual([]);
    expect((await rows(`select id from leadgen_conversions where appointment_id='${id}'`)).length).toBe(0);
    await asUser(admin);
    expect(await visibleAppts()).toEqual([id]); // Admin and the agent still see it
    await asUser(goodness);
    expect(await visibleAppts()).toEqual([id]);
  });

  it("keeps it hidden while sent back for more qualification or after rejection", async () => {
    await asService();
    const id = await newAppt(leadHid2, hid, campHid, goodness);
    await db.exec(`update leadgen_appointments set qc_status='needs_info', qc_admin_feedback='more please', qc_reviewed_by='${admin}' where id='${id}'`);
    await asUser(clientUserHid);
    expect((await rows(`select id from leadgen_appointments where id='${id}'`)).length).toBe(0);
    await asService();
    await db.exec(`update leadgen_appointments set qc_status='rejected', qc_rejection_reason='No interest in website services', qc_reviewed_by='${admin}' where id='${id}'`);
    await asUser(clientUserHid);
    expect((await rows(`select id from leadgen_appointments where id='${id}'`)).length).toBe(0);
    expect((await rows(`select id from leadgen_conversions where appointment_id='${id}'`)).length).toBe(0);
  });

  it("reveals the appointment and its conversion to the client only after Admin approval", async () => {
    await asService();
    const id = await newAppt(leadTek, tek, campTek, henry);
    await asUser(clientUserTek);
    expect((await rows(`select id from leadgen_appointments where id='${id}'`)).length).toBe(0);
    await asService();
    const q = await rows<{ id: string }>(`select id from leadgen_lead_qualifications where lead_id='${leadTek}'`);
    await db.exec(`update leadgen_appointments set qc_status='approved', qualification_id='${q[0].id}', qc_reviewed_by='${admin}' where id='${id}'`);
    await asUser(clientUserTek);
    expect((await rows(`select id from leadgen_appointments where id='${id}'`)).length).toBe(1);
    expect((await rows(`select id from leadgen_conversions where appointment_id='${id}'`)).length).toBe(1);
  });

  it("a client can never see another client's appointments", async () => {
    await asUser(clientUserTek);
    expect((await rows<{ client_id: string }>("select client_id from leadgen_appointments")).every((r) => r.client_id === tek)).toBe(true);
  });

  it("a client cannot update the conversion row of an unapproved appointment", async () => {
    await asService();
    const id = await newAppt(leadHid, hid, campHid, goodness);
    await asUser(clientUserHid);
    await db.exec(`update leadgen_conversions set note='tamper' where appointment_id='${id}'`);
    await asService();
    expect((await rows<{ note: string | null }>(`select note from leadgen_conversions where appointment_id='${id}'`))[0].note).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 20261111120000: Google visibility / marketing columns + digital_marketing key
// ---------------------------------------------------------------------------
describe("Google marketing columns (20261111120000)", () => {
  const googleMigration = readFileSync("supabase/migrations/20261111120000_leadgen_google_marketing_qualification.sql", "utf8");
  const leadG = "30000000-0000-0000-0000-0000000000a1";
  const leadW = "30000000-0000-0000-0000-0000000000a2";

  beforeAll(async () => {
    await asService();
    await db.exec(googleMigration);
    await db.exec(`insert into leadgen_leads values ('${leadG}','${tek}','${campTek}','${henry}',null),('${leadW}','${brent}','${campBrent}','${henry}',null)`);
  });

  it("is safe to apply twice", async () => {
    await asService();
    await db.exec(googleMigration);
  });

  it("saves the Google answers on the existing qualification record and reads them back", async () => {
    await asUser(henry);
    await db.exec(`insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id, has_website, services_of_interest, google_interest, online_customers_satisfied, google_visibility, ai_search_interest, investing_marketing, specialist_interest)
      values ('${leadG}','${tek}','${campTek}','${henry}','yes', array['seo_visibility','digital_marketing'], 'more', 'not_satisfied', 'no', 'more', 'unsure', 'follow_up')`);
    const [r] = await rows<Record<string, unknown>>(`select google_interest, online_customers_satisfied, google_visibility, ai_search_interest, investing_marketing, specialist_interest, services_of_interest from leadgen_lead_qualifications where lead_id='${leadG}'`);
    expect(r).toMatchObject({ google_interest: "more", online_customers_satisfied: "not_satisfied", google_visibility: "no", ai_search_interest: "more", investing_marketing: "unsure", specialist_interest: "follow_up" });
    expect(r.services_of_interest).toEqual(["seo_visibility", "digital_marketing"]);
  });

  it("rejects values outside the allowed answers", async () => {
    await asService();
    await rejects(`update leadgen_lead_qualifications set google_interest = 'maybe' where lead_id='${leadG}'`, /check/i);
    await rejects(`update leadgen_lead_qualifications set specialist_interest = 'sure' where lead_id='${leadG}'`, /check/i);
    await rejects(`update leadgen_lead_qualifications set ai_search_interest = 'unsure' where lead_id='${leadG}'`, /check/i);
  });

  it("still rejects unknown service keys; digital_marketing is only a valid key, never auto-approved", async () => {
    await asService();
    await rejects(`update leadgen_lead_qualifications set services_of_interest = array['guaranteed_rankings'] where lead_id='${leadG}'`, /qualification_invalid_service/);
    const [s] = await rows<{ approved_services: string[] }>(`select approved_services from leadgen_client_qualification_settings where client_id='${tek}'`);
    expect(s.approved_services).not.toContain("digital_marketing");
  });

  it("leaves other clients' records free of Google answers and unchanged", async () => {
    await asUser(henry);
    await db.exec(`insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id) values ('${leadW}','${brent}','${campBrent}','${henry}')`);
    const [r] = await rows<Record<string, unknown>>(`select google_interest, specialist_interest from leadgen_lead_qualifications where lead_id='${leadW}'`);
    expect(r).toEqual({ google_interest: null, specialist_interest: null });
  });
});

// ---------------------------------------------------------------------------
// 20261112000000: qualified-appointment confirmations
// ---------------------------------------------------------------------------
describe("Qualified appointment confirmations (20261112000000)", () => {
  const confirmMigration = readFileSync("supabase/migrations/20261112000000_leadgen_qualified_appointment_confirmations.sql", "utf8");
  const lead = (n: number) => `30000000-0000-0000-0000-0000000000b${n}`;

  beforeAll(async () => {
    await asService();
    await db.exec(confirmMigration);
    await db.exec([1, 2, 3, 4, 5].map((n) => `insert into leadgen_leads values ('${lead(n)}','${tek}','${campTek}','${henry}',null)`).join(";"));
  });

  it("is safe to apply twice", async () => {
    await asService();
    await db.exec(confirmMigration);
  });

  it("rejects 'qualified' without the call confirmations", async () => {
    await asService();
    await rejects(goodQualification(lead(1), tek, campTek, henry).replace("'seo_visibility'", "'seo_visibility'"), /qualification_incomplete/);
  });

  it("rejects 'qualified' when the contact is not the decision-maker, or a confirmation is missing", async () => {
    await asService();
    const cols = "decision_maker, contact_verified, appointment_confirmed";
    await rejects(goodQualification(lead(2), tek, campTek, henry, `${cols}|'no', true, true`).replace("array['redesign_rebranding']", "array['seo_visibility']"), /qualification_incomplete/);
    await rejects(goodQualification(lead(2), tek, campTek, henry, `${cols}|'yes', false, true`).replace("array['redesign_rebranding']", "array['seo_visibility']"), /qualification_incomplete/);
    await rejects(goodQualification(lead(2), tek, campTek, henry, `${cols}|'yes', true, null`).replace("array['redesign_rebranding']", "array['seo_visibility']"), /qualification_incomplete/);
  });

  it("accepts 'qualified' once every confirmation is recorded", async () => {
    await asService();
    const cols = "decision_maker, contact_verified, appointment_confirmed";
    await db.exec(goodQualification(lead(3), tek, campTek, henry, `${cols}|'yes', true, true`));
    const [r] = await rows<{ outcome: string; decision_maker: string }>(`select outcome, decision_maker from leadgen_lead_qualifications where lead_id='${lead(3)}'`);
    expect(r).toEqual({ outcome: "qualified", decision_maker: "yes" });
  });

  it("a request for information alone (no agreement to an appointment) can never be qualified", async () => {
    await asService();
    const cols = "decision_maker, contact_verified, appointment_confirmed";
    await rejects(goodQualification(lead(4), tek, campTek, henry, `${cols}|'yes', true, true`).replace("true, true,\n    array", "true, false,\n    array"), /qualification_incomplete/);
  });

  it("older qualifications (created before the rule) keep working unchanged", async () => {
    await asService();
    await db.exec(goodQualification(lead(5), tek, campTek, henry, "created_at|timestamptz '2026-11-03 12:00:00+00'"));
    const [r] = await rows<{ ok: boolean }>(`select leadgen_qualification_is_qualifiable(q) as ok from leadgen_lead_qualifications q where lead_id='${lead(5)}'`);
    expect(r.ok).toBe(true);
  });

  it("rejects values outside the allowed decision-maker answers", async () => {
    await asService();
    await rejects(`insert into leadgen_lead_qualifications (lead_id, client_id, campaign_id, agent_id, outcome, decision_maker) values ('${lead(4)}','${tek}','${campTek}','${henry}','draft','maybe')`, /check/i);
  });
});
