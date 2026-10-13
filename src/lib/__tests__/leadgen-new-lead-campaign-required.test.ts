import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const HENRY = "79be9174-e168-4f0f-a7b8-7e97f662fc3d";
const GOODNESS = "a8f77781-daed-4c5c-b8fa-09c27609ae14";
const ADMIN = "2101e587-c4fd-40af-914a-46db900ac711";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let currentAgent = HENRY;

// Minimal chainable stand-in for the Supabase client: select().eq()...maybeSingle()
// and insert().select().single(), recording every insert.
function fakeClient() {
  return {
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let pendingInsert: Row[] | null = null;
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle: async () => ({ data: (tables[table] ?? []).find((row) => filters.every(([c, v]) => row[c] === v)) ?? null }),
        insert: (value: Row | Row[]) => {
          pendingInsert = Array.isArray(value) ? value : [value];
          const rows = pendingInsert.map((row, i) => ({ id: `new-${(tables[table] ??= []).length + i}`, ...row }));
          tables[table].push(...rows);
          return Object.assign(Promise.resolve({ error: null }), builder);
        },
        single: async () => ({ data: tables[table][tables[table].length - 1], error: null }),
      };
      return builder;
    },
  };
}

class RedirectError extends Error {
  constructor(public url: string) {
    super(url);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => fakeClient() }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => fakeClient() }));
vi.mock("../leadgen-auth", () => ({
  requireLeadgenAgent: async () => ({ id: currentAgent, full_name: "Agent", email: "agent@example.com" }),
  requireLeadgenAdmin: async () => ({ id: ADMIN, full_name: "Admin", email: "info@winsalotcorp.com" }),
}));
vi.mock("../dnc-suppression", () => ({ checkDncSuppression: async () => null }));

import { checkNewLeadCampaign, NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE } from "../leadgen-new-lead-campaign";
import { createAgentLeadAction } from "../../app/leadgen/agent/(dashboard)/leads/new/actions";
import { createLeadAction, uploadLeadsCsvAction } from "../../app/leadgen/admin/(dashboard)/leads/actions";

const TEK = "client-teknokraft";
const HID = "client-hidebrandt";
const BRENT = "client-brents";
const OFF = "client-inactive";

beforeEach(() => {
  currentAgent = HENRY;
  tables.leadgen_clients = [
    { id: TEK, active: true },
    { id: HID, active: true },
    { id: BRENT, active: true },
    { id: OFF, active: false },
  ];
  tables.leadgen_campaigns = [
    { id: "tek-snow", name: "Teknokraft — Toronto Snow Removal", status: "active", client_id: TEK },
    { id: "tek-paused", name: "Teknokraft — Paused", status: "paused", client_id: TEK },
    { id: "hid-win", name: "Hidebrandt — Winnipeg", status: "active", client_id: HID },
    { id: "brent-growth", name: "Brent's Essentials — Growth Consultation", status: "active", client_id: BRENT },
    { id: "q3", name: "Q3 Growth Campaign", status: "active", client_id: BRENT },
    { id: "off-camp", name: "Old Client Campaign", status: "active", client_id: OFF },
  ];
  tables.leadgen_campaign_agents = [
    { campaign_id: "tek-snow", agent_id: HENRY },
    { campaign_id: "tek-paused", agent_id: HENRY },
    { campaign_id: "hid-win", agent_id: GOODNESS },
    { campaign_id: "off-camp", agent_id: HENRY },
    { campaign_id: "q3", agent_id: HENRY },
  ];
  tables.leadgen_leads = [{ id: "existing-1", business_name: "Existing", client_id: BRENT, campaign_id: null, assigned_agent_id: HENRY }];
});

function form(fields: Record<string, string | File>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
async function redirectUrl(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RedirectError) return decodeURIComponent(error.url);
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("checkNewLeadCampaign (pure rules)", () => {
  const campaign = { id: "c1", name: "Real Campaign", status: "active", client_id: "cl1" };
  const client = { id: "cl1", active: true };
  it("requires a campaign", () => {
    expect(checkNewLeadCampaign({ campaignId: "", campaign: null, client: null })).toEqual({ ok: false, error: NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE });
  });
  it("accepts an active campaign and returns its client", () => {
    expect(checkNewLeadCampaign({ campaignId: "c1", campaign, client })).toEqual({ ok: true, campaignId: "c1", clientId: "cl1" });
  });
  it("rejects a client that doesn't own the campaign", () => {
    expect(checkNewLeadCampaign({ campaignId: "c1", submittedClientId: "other", campaign, client }).ok).toBe(false);
  });
});

describe("agent: Add Lead requires an active campaign assigned to the agent", () => {
  it("Henry saves a lead on his assigned campaign; client comes from the campaign", async () => {
    const url = await redirectUrl(createAgentLeadAction(form({ business_name: "Snow Co", client_id: TEK, campaign_id: "tek-snow" })));
    expect(url).toMatch(/^\/leadgen\/agent\/leads\/new-\d+\?added=1/);
    const created = tables.leadgen_leads[tables.leadgen_leads.length - 1];
    expect(created).toMatchObject({ business_name: "Snow Co", client_id: TEK, campaign_id: "tek-snow", assigned_agent_id: HENRY, created_by: HENRY });
  });

  it("rejects 'No campaign' (empty) and creates nothing", async () => {
    const before = tables.leadgen_leads.length;
    expect(await redirectUrl(createAgentLeadAction(form({ business_name: "X", client_id: TEK, campaign_id: "" })))).toContain(NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE);
    expect(await redirectUrl(createAgentLeadAction(form({ business_name: "X", client_id: TEK })))).toContain(NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE);
    expect(tables.leadgen_leads).toHaveLength(before);
  });

  it("rejects paused, unassigned, hidden, inactive-client and mismatched-client campaigns", async () => {
    const before = tables.leadgen_leads.length;
    const attempts: [Record<string, string>, string][] = [
      [{ client_id: TEK, campaign_id: "tek-paused" }, "not active"],
      [{ client_id: BRENT, campaign_id: "brent-growth" }, "isn't assigned to you"],
      [{ client_id: BRENT, campaign_id: "q3" }, "not available"],
      [{ client_id: OFF, campaign_id: "off-camp" }, "inactive"],
      [{ client_id: TEK, campaign_id: "hid-win" }, "doesn't belong"],
      [{ client_id: HID, campaign_id: "tek-snow" }, "doesn't belong"],
      [{ client_id: TEK, campaign_id: "does-not-exist" }, "not available"],
    ];
    for (const [fields, message] of attempts) {
      expect(await redirectUrl(createAgentLeadAction(form({ business_name: "X", ...fields })))).toContain(message);
    }
    expect(tables.leadgen_leads).toHaveLength(before);
  });

  it("Goodness can use only his own campaign, never Henry's", async () => {
    currentAgent = GOODNESS;
    expect(await redirectUrl(createAgentLeadAction(form({ business_name: "X", client_id: TEK, campaign_id: "tek-snow" })))).toContain("isn't assigned to you");
    await redirectUrl(createAgentLeadAction(form({ business_name: "Win Co", client_id: HID, campaign_id: "hid-win" })));
    expect(tables.leadgen_leads[tables.leadgen_leads.length - 1]).toMatchObject({ client_id: HID, campaign_id: "hid-win", assigned_agent_id: GOODNESS });
  });

  it("never touches existing leads", async () => {
    const snapshot = JSON.stringify(tables.leadgen_leads[0]);
    await redirectUrl(createAgentLeadAction(form({ business_name: "Snow Co", client_id: TEK, campaign_id: "tek-snow" })));
    expect(JSON.stringify(tables.leadgen_leads[0])).toBe(snapshot);
  });
});

describe("Admin: Add Lead and CSV upload require an active campaign", () => {
  it("Admin can save a lead on any active, visible campaign", async () => {
    const result = await createLeadAction(form({ business_name: "Brent Lead", client_id: BRENT, campaign_id: "brent-growth" }));
    expect(result.error).toBeUndefined();
    expect(tables.leadgen_leads[tables.leadgen_leads.length - 1]).toMatchObject({ client_id: BRENT, campaign_id: "brent-growth", created_by: ADMIN });
  });

  it("rejects missing, paused, hidden, inactive-client and mismatched campaigns", async () => {
    const before = tables.leadgen_leads.length;
    expect((await createLeadAction(form({ business_name: "X", client_id: TEK, campaign_id: "" }))).error).toBe(NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE);
    expect((await createLeadAction(form({ business_name: "X", client_id: TEK, campaign_id: "tek-paused" }))).error).toContain("not active");
    expect((await createLeadAction(form({ business_name: "X", client_id: BRENT, campaign_id: "q3" }))).error).toContain("not available");
    expect((await createLeadAction(form({ business_name: "X", client_id: OFF, campaign_id: "off-camp" }))).error).toContain("inactive");
    expect((await createLeadAction(form({ business_name: "X", client_id: HID, campaign_id: "tek-snow" }))).error).toContain("doesn't belong");
    expect(tables.leadgen_leads).toHaveLength(before);
  });

  it("CSV upload needs a campaign too, and stamps client + campaign on every row", async () => {
    const csv = new File(["Business Name\nAlpha Pets\nBeta Pets\n"], "leads.csv", { type: "text/csv" });
    const before = tables.leadgen_leads.length;
    expect((await uploadLeadsCsvAction(form({ client_id: TEK, campaign_id: "", file: csv }))).error).toBe(NEW_LEAD_CAMPAIGN_REQUIRED_MESSAGE);
    expect(tables.leadgen_leads).toHaveLength(before);
    const ok = await uploadLeadsCsvAction(form({ client_id: TEK, campaign_id: "tek-snow", file: csv }));
    expect(ok.imported).toBe(2);
    expect(tables.leadgen_leads.slice(before).every((l) => l.client_id === TEK && l.campaign_id === "tek-snow")).toBe(true);
  });
});
