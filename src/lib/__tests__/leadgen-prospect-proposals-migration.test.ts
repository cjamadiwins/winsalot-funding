import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Real-Postgres check (PGlite) of 20261112010000_leadgen_prospect_proposals.sql.
const migration = readFileSync("supabase/migrations/20261112010000_leadgen_prospect_proposals.sql", "utf8");
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
const agent = "00000000-0000-0000-0000-000000000002";
const client = "10000000-0000-0000-0000-000000000001";
const lead = "30000000-0000-0000-0000-000000000001";

async function as(id: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
async function asService() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
}
const insertSql = (status = "draft", leadId = lead) =>
  `insert into leadgen_prospect_proposals (lead_id, client_id, title, content, email_to, email_subject, email_body, attachment_filename, status)
   values ('${leadId}', '${client}', 'T', '{"version":1}'::jsonb, 'a@b.test', 'S', 'B', 'f.pdf', '${status}')`;

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table leadgen_users(id uuid primary key, role text, active boolean default true);
    create table leadgen_clients(id uuid primary key);
    create table leadgen_campaigns(id uuid primary key);
    create table leadgen_leads(id uuid primary key);
    create table leadgen_emails(id uuid primary key);
    create function leadgen_user_role(uid uuid) returns text language sql stable security definer set search_path = public as $$ select role from leadgen_users where id=uid and active $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    insert into leadgen_users values ('${admin}','admin',true),('${agent}','agent',true);
    insert into leadgen_clients values ('${client}');
    insert into leadgen_leads values ('${lead}'),('30000000-0000-0000-0000-000000000002');`);
  await db.exec(migration);
  await db.exec(`grant select, insert, update, delete on leadgen_prospect_proposals to authenticated;`);
});
afterAll(async () => { await db.close(); });

describe("prospect proposals table", () => {
  it("is safe to apply twice", async () => {
    await asService();
    await db.exec(migration);
  });

  it("Admin can save, read and update a draft", async () => {
    await as(admin);
    await db.exec(insertSql());
    const r = await db.query<{ n: number }>("select count(*)::int as n from leadgen_prospect_proposals");
    expect(r.rows[0].n).toBe(1);
    await db.exec("update leadgen_prospect_proposals set email_subject = 'S2'");
  });

  it("an agent can neither see nor write proposals", async () => {
    await as(agent);
    const r = await db.query<{ n: number }>("select count(*)::int as n from leadgen_prospect_proposals");
    expect(r.rows[0].n).toBe(0);
    await expect(db.exec(insertSql("draft", "30000000-0000-0000-0000-000000000002"))).rejects.toThrow(/row-level security/);
  });

  it("only one open draft per lead, but a sent proposal does not block a new draft", async () => {
    await as(admin);
    await expect(db.exec(insertSql())).rejects.toThrow(/unique|duplicate/i);
    await db.exec("update leadgen_prospect_proposals set status = 'sent'");
    await db.exec(insertSql());
    const r = await db.query<{ n: number }>("select count(*)::int as n from leadgen_prospect_proposals where lead_id = '" + lead + "'");
    expect(r.rows[0].n).toBe(2);
  });

  it("rejects an unknown status", async () => {
    await as(admin);
    await expect(db.exec(insertSql("approved", "30000000-0000-0000-0000-000000000002"))).rejects.toThrow(/check/i);
  });
});
