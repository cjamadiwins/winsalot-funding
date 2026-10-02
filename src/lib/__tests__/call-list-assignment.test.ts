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
import { GROWTH_CALL_LIST_OWNER } from "@/lib/growth-call-list-owner";
import type { CallListSegmentRow } from "@/lib/call-list-types";

const seg = (over: Partial<CallListSegmentRow>) => ({ id: "s1", crm: "growth", growth_opportunity_type: "lead_generation", leadgen_campaign_id: null, crm_client_id: null, campaign_owner_name: null, industry: "Pet Sitter", territory: "Niagara Falls", name: "Pet Sitter — Niagara Falls", source_file_name: "import-original.csv", campaign_name: null, ...over }) as CallListSegmentRow;
const roster = () => (db.call_list_segment_agents ?? []).map((r) => r.agent_id).sort();
const saveGrowth = (service: string, ids: string[], segment = seg({})) => saveGrowthSegmentAssignment(segment, service, ids);

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
  db.crm_clients = [
    { id: "prospect1", company_name: "Teknokraft Canada Inc.", status: "Prospect", is_internal_test: false },
    { id: "test", company_name: "Winsalot Corp. Test", status: "Prospect", is_internal_test: true },
  ];
  db.call_list_segments = [{ id: "s1", growth_opportunity_type: "lead_generation", crm_client_id: null, campaign_name: null, source_file_name: "import-original.csv" }];
  db.call_list_segment_agents = [];
});

describe("Growth: fixed Winsalot owner, service + agents", () => {
  it("assigns one agent, then multiple, respecting eligibility", async () => {
    await saveGrowth("lead_generation", ["henry"]);
    expect(roster()).toEqual(["henry"]);
    db.crm_agent_service_assignments.find((a) => a.agent_id === "goodness")!.service = "both";
    await saveGrowth("lead_generation", ["henry", "goodness"]);
    expect(roster()).toEqual(["goodness", "henry"]);
  });

  it("refuses an agent whose service assignment doesn't cover the list", async () => {
    await expect(saveGrowth("lead_generation", ["goodness"])).rejects.toThrow(/Goodness isn't assigned to Lead Generation/);
    expect(roster()).toEqual([]);
  });

  it("removing one agent leaves the other's row untouched", async () => {
    db.crm_agent_service_assignments.find((a) => a.agent_id === "goodness")!.service = "both";
    await saveGrowth("lead_generation", ["henry", "goodness"]);
    const before = db.call_list_segment_agents.find((r) => r.agent_id === "goodness");
    const result = await saveGrowth("lead_generation", ["goodness"]);
    expect(result).toEqual({ added: 0, removed: 1 });
    expect(roster()).toEqual(["goodness"]);
    expect(db.call_list_segment_agents.find((r) => r.agent_id === "goodness")).toBe(before);
  });

  it("changing the service re-checks agents and never touches history tables", async () => {
    db.crm_opportunities = [{ id: "o1", opportunity_type: "lead_generation" }];
    await saveGrowth("lead_generation", ["henry"]);
    await expect(saveGrowth("business_financing", ["henry"])).rejects.toThrow(/Henry isn't assigned to Business Finance/);
    await saveGrowth("business_financing", ["goodness"]);
    expect(db.call_list_segments[0].growth_opportunity_type).toBe("business_financing");
    expect(db.call_list_segments[0].crm_client_id).toBeNull();
    expect(db.call_list_segments[0].campaign_owner_name).toBe(GROWTH_CALL_LIST_OWNER);
    expect(db.call_list_segments[0].campaign_name).toBe("Winsalot Corp — Pet Sitter — Niagara Falls");
    expect(db.crm_clients.map((c) => c.company_name)).toEqual(["Teknokraft Canada Inc.", "Winsalot Corp. Test"]);
    expect(db.call_list_segments[0].source_file_name).toBe("import-original.csv");
    expect(roster()).toEqual(["goodness"]);
    expect(db.crm_opportunities).toEqual([{ id: "o1", opportunity_type: "lead_generation" }]);
  });

  it("rejects an invalid service and a Lead Gen list", async () => {
    await expect(saveGrowth("cleaning", ["henry"])).rejects.toThrow();
    await expect(saveGrowth("lead_generation", [], seg({ crm: "lead_generation" }))).rejects.toThrow();
  });

  it("allows clearing the roster (unassign everyone)", async () => {
    await saveGrowth("lead_generation", ["henry"]);
    await saveGrowth("lead_generation", []);
    expect(roster()).toEqual([]);
  });

  it("uses the fixed Winsalot owner and leaves prospect and test account records unchanged", async () => {
    const before = structuredClone(db.crm_clients);
    await saveGrowth("lead_generation", ["henry"], seg({ crm_client_id: "prospect1" }));
    expect(db.call_list_segments[0].campaign_owner_name).toBe(GROWTH_CALL_LIST_OWNER);
    expect(db.call_list_segments[0].crm_client_id).toBeNull();
    expect(db.crm_clients).toEqual(before);
  });
});

describe("Lead Gen: client and list assignments stay linked", () => {
  beforeEach(() => {
    db.leadgen_campaigns = [{ id: "c-tek", client_id: "tek", status: "active" }, { id: "c-hid", client_id: "hid", status: "active" }];
    db.leadgen_clients = [{ id: "tek", name: "Teknokraft Canada Inc.", active: true }, { id: "hid", name: "Hidebrandt Web Services", active: true }];
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
    db.call_list_segments = [{ id: "s1", leadgen_campaign_id: "c-tek", campaign_name: null, industry: "Auto Repair", territory: "Toronto", source_file_name: "import-original.csv" }];
    db.call_list_leads = [{ id: "lead-1", segment_id: "s1", notes: "keep", dnc_flag: true }];
    db.leadgen_call_logs = [{ id: "call-1", call_list_segment_id: "s1", client_id: "tek", notes: "keep" }];
    db.leadgen_appointments = [{ id: "appt-1", client_id: "tek", notes: "keep" }];
  });
  const lg = (over: Partial<CallListSegmentRow> = {}) => seg({ crm: "lead_generation", growth_opportunity_type: null, leadgen_campaign_id: "c-tek", ...over });

  it("puts agents who hold the client on the list, idempotently, without touching client assignment", async () => {
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry", "goodness"]);
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry", "goodness"]);
    expect(roster()).toEqual(["goodness", "henry"]);
    expect(db.leadgen_campaign_agents).toHaveLength(3);
  });

  it("never grants client access: an agent who doesn't hold the client is refused and nothing is created", async () => {
    const before = structuredClone(db.leadgen_campaign_agents);
    await expect(saveLeadgenSegmentAssignment(lg({ leadgen_campaign_id: "c-hid" }), "c-hid", ["henry", "goodness"], "hid", "admin1")).rejects.toThrow(/Goodness isn't assigned to Hidebrandt Web Services/);
    expect(db.leadgen_campaign_agents).toEqual(before);
    expect(roster()).toEqual([]);
  });

  it("assigns a list only to agents who already hold the client", async () => {
    await saveLeadgenSegmentAssignment(lg({ leadgen_campaign_id: "c-hid" }), "c-hid", ["henry"], "hid", "admin1");
    expect(roster()).toEqual(["henry"]);
    expect(db.leadgen_campaign_agents).toHaveLength(3);
  });

  it("fills in a newly added campaign for an agent who already holds the client (no new client access)", async () => {
    db.leadgen_campaigns.push({ id: "c-hid-2", client_id: "hid", status: "active" });
    await saveLeadgenSegmentAssignment(lg({ leadgen_campaign_id: "c-hid-2" }), "c-hid-2", ["henry"], "hid", "admin1");
    expect(db.leadgen_campaign_agents.some((r) => r.campaign_id === "c-hid-2" && r.agent_id === "henry")).toBe(true);
    expect(db.leadgen_campaign_agents.some((r) => r.agent_id === "goodness" && ["c-hid", "c-hid-2"].includes(r.campaign_id as string))).toBe(false);
  });

  it("removing an agent from one list keeps their client assignment and the other agent", async () => {
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry", "goodness"]);
    const result = await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry"]);
    expect(result).toEqual({ added: 0, removed: 1 });
    expect(roster()).toEqual(["henry"]);
    expect(db.leadgen_campaign_agents.some((r) => r.agent_id === "goodness" && r.campaign_id === "c-tek")).toBe(true);
  });

  it("changing the list's client updates only the campaign and keeps history", async () => {
    const preserved = {
      leads: structuredClone(db.call_list_leads),
      calls: structuredClone(db.leadgen_call_logs),
      appointments: structuredClone(db.leadgen_appointments),
    };
    await saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry"]);
    await saveLeadgenSegmentAssignment(lg(), "c-hid", ["henry"]);
    expect(db.call_list_segments[0].leadgen_campaign_id).toBe("c-hid");
    expect(db.call_list_segments[0].campaign_name).toBe("Lead Generation for Website & SEO");
    expect(db.call_list_segment_agents.some((r) => r.agent_id === "henry")).toBe(true);
    expect(db.leadgen_campaign_agents.some((r) => r.campaign_id === "c-hid" && r.agent_id === "henry")).toBe(true);
    expect(db.call_list_leads).toEqual(preserved.leads);
    expect(db.leadgen_call_logs).toEqual(preserved.calls);
    expect(db.leadgen_appointments).toEqual(preserved.appointments);
    expect(db.call_list_segments[0].source_file_name).toBe("import-original.csv");
  });

  it("rejects a campaign that doesn't belong to the selected client", async () => {
    await expect(saveLeadgenSegmentAssignment(lg(), "c-tek", ["henry"], "hid")).rejects.toThrow(/doesn't belong to the selected client/);
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
