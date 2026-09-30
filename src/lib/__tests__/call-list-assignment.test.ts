import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

// Minimal in-memory stand-in for the service-role client: enough of the query
// builder for the assignment code (select/eq/in/delete/insert/upsert/update).
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
    upsert: (rs: Row[], o: { onConflict: string }) => {
      const keys = o.onConflict.split(",");
      for (const r of rs) if (!rows().some((x) => keys.every((k) => x[k] === r[k]))) rows().push({ ...r });
      return { error: null };
    },
    maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return builder;
}
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => table(t) }) }));

import { saveGrowthSegmentAssignment, saveLeadgenSegmentAssignment } from "@/lib/call-list-assignment";
import type { CallListSegmentRow } from "@/lib/call-list-types";

const seg = (over: Partial<CallListSegmentRow>) => ({ id: "s1", crm: "growth", growth_opportunity_type: "lead_generation", leadgen_campaign_id: null, ...over }) as CallListSegmentRow;
const roster = () => (db.call_list_segment_agents ?? []).map((r) => r.agent_id).sort();

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.crm_users = [
    { id: "henry", full_name: "Henry", role: "agent", active: true },
    { id: "goodness", full_name: "Goodness", role: "agent", active: true },
  ];
  db.crm_agent_service_assignments = [
    { agent_id: "henry", service: "lead_generation" },
    { agent_id: "goodness", service: "business_financing" },
  ];
  db.call_list_segments = [{ id: "s1", growth_opportunity_type: "lead_generation" }];
  db.call_list_segment_agents = [];
});

describe("Growth: service + agents", () => {
  it("assigns one agent, then multiple, respecting eligibility", async () => {
    await saveGrowthSegmentAssignment(seg({}), "lead_generation", ["henry"]);
    expect(roster()).toEqual(["henry"]);
    db.crm_agent_service_assignments.find((a) => a.agent_id === "goodness")!.service = "both";
    await saveGrowthSegmentAssignment(seg({}), "lead_generation", ["henry", "goodness"]);
    expect(roster()).toEqual(["goodness", "henry"]);
  });

  it("refuses an agent whose service assignment doesn't cover the list", async () => {
    await expect(saveGrowthSegmentAssignment(seg({}), "lead_generation", ["goodness"])).rejects.toThrow(/Goodness isn't assigned to Lead Generation/);
    expect(roster()).toEqual([]);
  });

  it("removing one agent leaves the other's row untouched", async () => {
    db.crm_agent_service_assignments.find((a) => a.agent_id === "goodness")!.service = "both";
    await saveGrowthSegmentAssignment(seg({}), "lead_generation", ["henry", "goodness"]);
    const before = db.call_list_segment_agents.find((r) => r.agent_id === "goodness");
    const result = await saveGrowthSegmentAssignment(seg({}), "lead_generation", ["goodness"]);
    expect(result).toEqual({ added: 0, removed: 1 });
    expect(roster()).toEqual(["goodness"]);
    expect(db.call_list_segment_agents.find((r) => r.agent_id === "goodness")).toBe(before);
  });

  it("changing the service re-checks agents and never touches history tables", async () => {
    db.crm_opportunities = [{ id: "o1", opportunity_type: "lead_generation" }];
    await saveGrowthSegmentAssignment(seg({}), "lead_generation", ["henry"]);
    await expect(saveGrowthSegmentAssignment(seg({}), "business_financing", ["henry"])).rejects.toThrow(/Henry isn't assigned to Business Finance/);
    await saveGrowthSegmentAssignment(seg({}), "business_financing", ["goodness"]);
    expect(db.call_list_segments[0].growth_opportunity_type).toBe("business_financing");
    expect(roster()).toEqual(["goodness"]);
    expect(db.crm_opportunities).toEqual([{ id: "o1", opportunity_type: "lead_generation" }]);
  });

  it("rejects an invalid service and a Lead Gen list", async () => {
    await expect(saveGrowthSegmentAssignment(seg({}), "cleaning", ["henry"])).rejects.toThrow();
    await expect(saveGrowthSegmentAssignment(seg({ crm: "lead_generation" }), "lead_generation", [])).rejects.toThrow();
  });

  it("allows clearing the roster (unassign everyone)", async () => {
    await saveGrowthSegmentAssignment(seg({}), "lead_generation", ["henry"]);
    await saveGrowthSegmentAssignment(seg({}), "lead_generation", []);
    expect(roster()).toEqual([]);
  });
});

describe("Lead Gen: client assignment and list assignment stay separate", () => {
  beforeEach(() => {
    db.leadgen_campaigns = [{ id: "c-tek", client_id: "tek" }, { id: "c-hid", client_id: "hid" }];
    db.leadgen_clients = [{ id: "tek", active: true }, { id: "hid", active: true }];
    db.leadgen_users = [
      { id: "henry", full_name: "Henry", role: "agent", active: true },
      { id: "goodness", full_name: "Goodness", role: "agent", active: true },
    ];
    // Both hold Teknokraft; only Henry holds Hidebrandt.
    db.leadgen_campaign_agents = [
      { campaign_id: "c-tek", agent_id: "henry" },
      { campaign_id: "c-tek", agent_id: "goodness" },
      { campaign_id: "c-hid", agent_id: "henry" },
    ];
    db.call_list_segments = [{ id: "s1", leadgen_campaign_id: "c-tek" }];
  });
  const lg = (over: Partial<CallListSegmentRow> = {}) => seg({ crm: "lead_generation", growth_opportunity_type: null, leadgen_campaign_id: "c-tek", ...over });

  it("puts agents who hold the client on the list, idempotently, without touching client assignment", async () => {
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry", "goodness"]);
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry", "goodness"]);
    expect(roster()).toEqual(["goodness", "henry"]);
    expect(db.leadgen_campaign_agents).toHaveLength(3);
  });

  it("never grants the client: an agent without it is refused", async () => {
    await expect(saveLeadgenSegmentAssignment(lg({ leadgen_campaign_id: "c-hid" }), "c-hid", ["henry", "goodness"])).rejects.toThrow(/Goodness isn't assigned to this client yet/);
    expect(roster()).toEqual([]);
    expect(db.leadgen_campaign_agents).toHaveLength(3);
  });

  it("removing an agent from one list keeps their client assignment and the other agent", async () => {
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry", "goodness"]);
    const result = await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry"]);
    expect(result).toEqual({ added: 0, removed: 1 });
    expect(roster()).toEqual(["henry"]);
    expect(db.leadgen_campaign_agents.some((r) => r.agent_id === "goodness" && r.campaign_id === "c-tek")).toBe(true);
  });

  it("changing the list's client requires the agents to hold the new client", async () => {
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry"]);
    await saveLeadgenSegmentAssignment(lg(), "c-hid", ["henry"]);
    expect(db.call_list_segments[0].leadgen_campaign_id).toBe("c-hid");
    await expect(saveLeadgenSegmentAssignment(lg({ leadgen_campaign_id: "c-hid" }), "c-hid", ["goodness"])).rejects.toThrow(/isn't assigned to this client/);
  });

  it("rejects unknown clients, inactive clients and inactive agents", async () => {
    await expect(saveLeadgenSegmentAssignment(lg(), "nope", ["henry"])).rejects.toThrow();
    db.leadgen_clients.find((c) => c.id === "hid")!.active = false;
    await expect(saveLeadgenSegmentAssignment(lg(), "c-hid", ["henry"])).rejects.toThrow(/isn't active/);
    db.leadgen_users.find((u) => u.id === "goodness")!.active = false;
    await expect(saveLeadgenSegmentAssignment(lg(), "c-tek", ["goodness"])).rejects.toThrow(/active agent/);
    expect(roster()).toEqual([]);
  });
});
