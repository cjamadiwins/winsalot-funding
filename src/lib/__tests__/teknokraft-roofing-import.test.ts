import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync } from "node:fs";
import {
  prepareRoofingCsv,
  buildRoofingSql,
} from "../../../scripts/prepare-teknokraft-roofing.mjs";
import { parseCsvRows } from "../leadgen-csv";
const db = new PGlite();
const tek = "10000000-0000-0000-0000-000000000001";
const hide = "10000000-0000-0000-0000-000000000002";
const good = "20000000-0000-0000-0000-000000000001";
const admin = "20000000-0000-0000-0000-000000000002";
const oldCampaign = "30000000-0000-0000-0000-000000000001";
const oldSegment = "40000000-0000-0000-0000-000000000001";
const schema = `
 create table leadgen_clients(id uuid primary key,name text,active boolean,is_internal_test boolean);
 create table leadgen_users(id uuid primary key,email text,role text,active boolean,current_campaign_id uuid);
 create table leadgen_campaigns(id uuid primary key default gen_random_uuid(),client_id uuid references leadgen_clients,name text,status text,target_industry text,territory text,service_type text,description text,created_by uuid);
 create table leadgen_campaign_agents(campaign_id uuid references leadgen_campaigns,agent_id uuid,assigned_by uuid,primary key(campaign_id,agent_id));
 create table call_list_segments(id uuid primary key default gen_random_uuid(),crm text,name text,campaign_name text,industry text,territory text,source_file_name text,source_file_type text,total_uploaded_rows integer,leadgen_campaign_id uuid references leadgen_campaigns,status text,deployed_at timestamptz,deployed_by uuid,created_by uuid,unique(crm,name));
 create table call_list_segment_agents(segment_id uuid references call_list_segments,agent_id uuid,primary key(segment_id,agent_id));
 create table call_list_leads(id uuid primary key default gen_random_uuid(),segment_id uuid references call_list_segments,source_row_number integer,business_name text,contact_name text,phone text,email text,website text,street_address text,city text,province text,postal_code text,country text,industry text,notes text,extra_fields jsonb,dnc_flag boolean,assigned_agent_id uuid,created_by uuid);
 create table leadgen_leads(id uuid primary key default gen_random_uuid(),client_id uuid,business_name text,phone text,email text,website text,city text);
 create table crm_dnc_suppressions(status text,removed_at timestamptz,block_phone boolean,block_email boolean,normalized_phone text,normalized_email text);
 insert into leadgen_clients values('${tek}','Teknokraft Canada Inc.',true,false),('${hide}','Hidebrandt',true,false);
 insert into leadgen_users values('${good}','ogbonnagoodness44@gmail.com','agent',true,'${oldCampaign}'),('${admin}','cjamadiwins@gmail.com','admin',true,null);
 insert into leadgen_campaigns(id,client_id,name,status) values('${oldCampaign}','${hide}','Existing','active');
 insert into leadgen_campaign_agents values('${oldCampaign}','${good}','${admin}');
 insert into call_list_segments(id,crm,name,leadgen_campaign_id,status) values('${oldSegment}','lead_generation','Existing List','${oldCampaign}','active');
 insert into call_list_segment_agents values('${oldSegment}','${good}');
 insert into call_list_leads(segment_id,business_name,phone,assigned_agent_id) values('${oldSegment}','Existing Prospect','4165550100','${good}');
 insert into leadgen_leads(client_id,business_name,phone,website,city) values('${tek}','Existing Teknokraft','4165550199','https://existing.ca','Toronto');
 insert into crm_dnc_suppressions values('active',null,true,false,'4165550111',null);
 `;
beforeAll(async () => {
  await db.exec(schema);
}, 30000);
afterAll(async () => {
  await db.close();
});
const fixtureCsv =
  "name,phone,website,address,category,first_name,last_name,email\n" +
  'Roof One,14165550111,https://roof-one.ca,"1 King St, Toronto, ON M5H 1A1, Canada",Roofers,Jane,Doe,jane@roof-one.ca\n' +
  'Duplicate Phone,4165550111,,"2 King St, Toronto, ON M5H 1A1, Canada",Roofers,,,\n' +
  'Roof Blank,4165550112,,"3 King St, Toronto, ON M5H 1A1, Canada",Roofers,,,\n' +
  'Outside,4165550113,,"4 King St, Ottawa, ON K1A 0B1, Canada",Roofers,,,\n' +
  'Already Here,14165550199,https://existing.ca,"5 King St, Toronto, ON M5H 1A1, Canada",Roofers,,,\n';
describe.sequential("roofing import transaction", () => {
  it("adds Goodness without replacing existing campaigns, deduplicates and preserves DNC and missing data", async () => {
    const before = (await db.query("select * from call_list_leads order by id"))
      .rows;
    const rows = prepareRoofingCsv(fixtureCsv);
    await db.exec(buildRoofingSql(rows, "roofing.csv"));
    expect(
      (await db.query("select * from leadgen_campaign_agents")).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query(
          `select current_campaign_id from leadgen_users where id='${good}'`,
        )
      ).rows[0],
    ).toEqual({ current_campaign_id: oldCampaign });
    expect(
      (
        await db.query(
          `select * from call_list_leads where segment_id='${oldSegment}' order by id`,
        )
      ).rows,
    ).toEqual(before);
    const imported = (
      await db.query<{
        business_name: string;
        contact_name: string | null;
        email: string | null;
        dnc_flag: boolean;
        extra_fields: Record<string, string>;
      }>(
        "select * from call_list_leads where source_row_number is not null order by source_row_number",
      )
    ).rows;
    expect(imported.map((r) => r.business_name)).toEqual([
      "Roof One",
      "Roof Blank",
      "Outside",
    ]);
    expect(imported[0]).toMatchObject({
      contact_name: "Jane Doe",
      dnc_flag: true,
    });
    expect(imported[1]).toMatchObject({
      contact_name: null,
      email: null,
      extra_fields: { website_opportunity: "verification_needed" },
    });
    expect(
      (
        await db.query(
          "select s.name from call_list_segments s join call_list_segment_agents a on a.segment_id=s.id where s.status='draft'",
        )
      ).rows,
    ).toEqual([]);
  });
  it("is idempotent on rerun", async () => {
    const before = (await db.query("select * from call_list_leads order by id"))
      .rows;
    await db.exec(
      buildRoofingSql(prepareRoofingCsv(fixtureCsv), "roofing.csv"),
    );
    expect(
      (await db.query("select * from call_list_leads order by id")).rows,
    ).toEqual(before);
  });
  it("parses every real export row, preserving raw quotes and not inferring absent websites", () => {
    const csv = readFileSync(
      "campaign-125683-search-929990-roofing-contractor_toronto-on-canada_6114fd364665ee161e390e1a563d0e97.csv",
      "utf8",
    );
    const rows = prepareRoofingCsv(csv);
    expect(rows).toHaveLength(1867);
    expect(
      rows.filter(
        (r: { opportunity: string }) => r.opportunity === "new_website",
      ),
    ).toHaveLength(0);
    expect(
      parseCsvRows('name,category\nRoof,General Contractors"""\n'),
    ).toEqual([
      ["name", "category"],
      ["Roof", 'General Contractors"""'],
    ]);
  });
});

it("dry-runs the complete source in isolated Postgres and is repeatable", async () => {
  const fullDb = new PGlite();
  try {
    await fullDb.exec(schema);
    const source =
      "campaign-125683-search-929990-roofing-contractor_toronto-on-canada_6114fd364665ee161e390e1a563d0e97.csv";
    const sql = buildRoofingSql(
      prepareRoofingCsv(readFileSync(source, "utf8")),
      source,
    );
    await fullDb.exec(sql);
    const result = (
      await fullDb.query(
        `select s.status, l.extra_fields->>'website_opportunity' opportunity, count(*)::int count from call_list_leads l join call_list_segments s on s.id=l.segment_id where l.source_row_number is not null group by 1,2 order by 1,2`,
      )
    ).rows;
    if (process.env.ROOFING_IMPORT_REPORT)
      writeFileSync(
        process.env.ROOFING_IMPORT_REPORT,
        JSON.stringify(result, null, 2),
      );
    const before = (
      await fullDb.query("select * from call_list_leads order by id")
    ).rows;
    await fullDb.exec(sql);
    expect(
      (await fullDb.query("select * from call_list_leads order by id")).rows,
    ).toEqual(before);
  } finally {
    await fullDb.close();
  }
}, 60000);
