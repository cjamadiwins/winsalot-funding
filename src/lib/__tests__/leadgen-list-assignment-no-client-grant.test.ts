import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: assigning an agent to a call list (or moving a list to another
// client) must never create a client-level assignment. This is how Henry Osuji
// ended up with a stray Hidebrandt Web Services assignment.
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function table(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "delete" | "update" = "select";
  let patch: Row = {};
  const rows = () => (db[name] ??= []);
  const matched = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === "delete") {
      db[name] = rows().filter((r) => !filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    if (op === "update") {
      for (const r of matched()) Object.assign(r, patch);
      return { data: null, error: null };
    }
    return { data: matched().map((r) => ({ ...r })), error: null };
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), builder),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), builder),
    delete: () => ((op = "delete"), builder),
    update: (p: Row) => ((op = "update"), (patch = p), builder),
    insert: (rs: Row[]) => (rows().push(...rs), { error: null }),
    upsert: (rs: Row | Row[], o: { onConflict: string }) => {
      const keys = o.onConflict.split(",");
      for (const r of Array.isArray(rs) ? rs : [rs]) if (!rows().some((x) => keys.every((k) => x[k] === r[k]))) rows().push({ ...r });
      return { error: null };
    },
    maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => table(t) }) }));
vi.mock("@/lib/leadgen-auth", () => ({ requireLeadgenAdmin: async () => ({ id: "admin1" }) }));
vi.mock("@/lib/leadgen-agent-active-client", () => ({ listSelectableActiveClients: async () => [], assignmentWouldRestrictAgent: () => false }));
vi.mock("@/lib/leadgen-campaign-assignment", () => ({ ensureRestrictedAgentOnCampaign: vi.fn() }));
vi.mock("@/lib/leadgen-test-client-guard", () => ({
  TEST_CLIENT_LIST_MESSAGE: "test client",
  friendlyTestClientError: () => null,
  isTestOnlyCampaign: async () => false,
}));

import { setSegmentAgentAction, setSegmentCampaignAction } from "@/app/leadgen/admin/(dashboard)/assignments/actions";

const UUIDS = {
  henry: "79be9174-e168-4f0f-a7b8-7e97f662fc3d",
  goodness: "a8f77781-daed-4c5c-b8fa-09c27609ae14",
  tek: "0ce00194-113a-4463-913e-641526f17053",
  hid: "8a0d9d1b-3e11-4b1e-8f54-2f1c1e0b9a11",
  cTek: "b7cf1c1e-327b-4922-9889-b7f82e1d3cb9",
  cHid: "91e3698a-6c59-4f83-8eb4-e5cb93f86015",
  seg: "e8127940-585e-4a5d-a3a8-0f83c27b9825",
};
const holds = (agent: string, client: "tek" | "hid") => (db.leadgen_campaign_agents ?? []).some((r) => r.agent_id === agent && r.campaign_id === (client === "tek" ? UUIDS.cTek : UUIDS.cHid));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.leadgen_users = [
    { id: UUIDS.henry, full_name: "Henry Osuji", role: "agent", active: true },
    { id: UUIDS.goodness, full_name: "Goodness Ugbana", role: "agent", active: true },
  ];
  db.leadgen_clients = [
    { id: UUIDS.tek, name: "Teknokraft Canada Inc.", active: true },
    { id: UUIDS.hid, name: "Hidebrandt Web Services", active: true },
  ];
  db.leadgen_campaigns = [
    { id: UUIDS.cTek, client_id: UUIDS.tek, status: "active" },
    { id: UUIDS.cHid, client_id: UUIDS.hid, status: "active" },
  ];
  // Intended ownership: Henry -> Teknokraft only, Goodness -> Hidebrandt only.
  db.leadgen_campaign_agents = [
    { campaign_id: UUIDS.cTek, agent_id: UUIDS.henry },
    { campaign_id: UUIDS.cHid, agent_id: UUIDS.goodness },
  ];
  db.call_list_segments = [{ id: UUIDS.seg, crm: "lead_generation", leadgen_campaign_id: UUIDS.cHid, industry: "Painters", territory: "Ottawa" }];
  db.call_list_segment_agents = [];
});

describe("assigning a list never creates a client assignment", () => {
  it("refuses to put Henry on a Hidebrandt list and does NOT add him to Hidebrandt", async () => {
    const result = await setSegmentAgentAction(UUIDS.seg, UUIDS.henry, true);
    expect(result.error).toMatch(/Henry Osuji isn't assigned to Hidebrandt Web Services/);
    expect(holds(UUIDS.henry, "hid")).toBe(false);
    expect(db.call_list_segment_agents).toHaveLength(0);
  });

  it("the exact Henry sequence leaves no Hidebrandt row: list assigned under Hidebrandt, then moved to Teknokraft", async () => {
    await setSegmentAgentAction(UUIDS.seg, UUIDS.henry, true); // refused
    db.call_list_segment_agents.push({ segment_id: UUIDS.seg, agent_id: UUIDS.henry }); // even if a roster row existed
    const moved = await setSegmentCampaignAction(UUIDS.seg, UUIDS.cTek);
    expect(moved.error).toBeUndefined();
    expect(holds(UUIDS.henry, "hid")).toBe(false);
    expect(holds(UUIDS.henry, "tek")).toBe(true);
  });

  it("allows an agent who already holds the client", async () => {
    const result = await setSegmentAgentAction(UUIDS.seg, UUIDS.goodness, true);
    expect(result.error).toBeUndefined();
    expect(db.call_list_segment_agents).toEqual([{ segment_id: UUIDS.seg, agent_id: UUIDS.goodness }]);
  });

  it("moving a list refuses (and changes nothing) when a rostered agent doesn't hold the new client", async () => {
    db.call_list_segment_agents.push({ segment_id: UUIDS.seg, agent_id: UUIDS.goodness });
    const before = structuredClone(db.leadgen_campaign_agents);
    const result = await setSegmentCampaignAction(UUIDS.seg, UUIDS.cTek);
    expect(result.error).toMatch(/Goodness Ugbana isn't assigned to Teknokraft Canada Inc\./);
    expect(db.leadgen_campaign_agents).toEqual(before);
    expect(db.call_list_segments[0].leadgen_campaign_id).toBe(UUIDS.cHid);
  });

  it("removing an agent from a list never touches client assignment", async () => {
    db.call_list_segment_agents.push({ segment_id: UUIDS.seg, agent_id: UUIDS.goodness });
    await setSegmentAgentAction(UUIDS.seg, UUIDS.goodness, false);
    expect(db.call_list_segment_agents).toHaveLength(0);
    expect(holds(UUIDS.goodness, "hid")).toBe(true);
  });
});
