import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Rehearses the draft in supabase/pending-approval (not applied to production):
// the surviving twin of each pair must have the identical definition, and the
// tables and their rows must be untouched.
const sql = readFileSync("supabase/pending-approval/20261020130000_drop_duplicate_indexes.sql", "utf8");
const db = new PGlite();
const defs = async () => (await db.query<{ indexname: string; indexdef: string }>("select indexname, indexdef from pg_indexes where schemaname='public' and tablename in ('crm_activities','crm_followups') and indexname not like '%pkey' order by 1")).rows;

beforeAll(async () => {
  await db.exec(`
    create table crm_activities(id serial primary key, opportunity_id uuid, occurred_at timestamptz);
    create table crm_followups(id serial primary key, opportunity_id uuid);
    create index crm_activities_opportunity_growth_idx on crm_activities (opportunity_id, occurred_at desc);
    create index crm_activities_opportunity_idx on crm_activities (opportunity_id, occurred_at desc);
    create index crm_followups_opportunity_growth_idx on crm_followups (opportunity_id);
    create index crm_followups_opportunity_idx on crm_followups (opportunity_id);
    insert into crm_activities(opportunity_id, occurred_at) select gen_random_uuid(), now() from generate_series(1,50);
    insert into crm_followups(opportunity_id) select gen_random_uuid() from generate_series(1,50);`);
});
afterAll(async () => { await db.close(); });

it("removes exactly the redundant copies, keeps an identical index, and leaves all rows alone", async () => {
  const before = await defs();
  await db.exec(sql);
  const after = await defs();
  expect(after.map((d) => d.indexname)).toEqual(["crm_activities_opportunity_growth_idx", "crm_followups_opportunity_growth_idx"]);
  const body = (d: string) => d.replace(/INDEX \S+ ON/, "INDEX x ON");
  for (const kept of after) expect(before.filter((b) => body(b.indexdef) === body(kept.indexdef)).length).toBe(2);
  expect((await db.query("select count(*)::int c from crm_activities")).rows[0]).toEqual({ c: 50 });
  expect((await db.query("select count(*)::int c from crm_followups")).rows[0]).toEqual({ c: 50 });
  await db.exec(sql); // idempotent
});
