import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const writes: string[] = [];

function table(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let payload: Row | Row[] = {};
  let conflict: string[] = [];
  const rows = () => (db[name] ??= []);
  const matched = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op !== "select") writes.push(`${op}:${name}`);
    if (op === "insert") { const r = { id: `new-${rows().length}`, ...(payload as Row) }; rows().push(r); return { data: [r], error: null }; }
    if (op === "update") { const m = matched(); m.forEach((r) => Object.assign(r, payload)); return { data: m, error: null }; }
    if (op === "upsert") {
      for (const r of [payload].flat() as Row[]) { const ex = rows().find((x) => conflict.every((k) => x[k] === r[k])); if (ex) Object.assign(ex, r); else rows().push({ ...r }); }
      return { data: null, error: null };
    }
    return { data: matched().map((r) => ({ ...r })), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), b),
    insert: (p: Row) => ((op = "insert"), (payload = p), b),
    update: (p: Row) => ((op = "update"), (payload = p), b),
    upsert: (p: Row[], o: { onConflict: string }) => ((op = "upsert"), (payload = p), (conflict = o.onConflict.split(",")), b),
    maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
    single: async () => { const r = run(); return { data: (r.data as Row[])?.[0] ?? null, error: r.error }; },
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return b;
}

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: table }) }));
vi.mock("@/lib/leadgen-launch-readiness", () => ({
  WEBSITE_LAUNCH_CLIENTS: ["Teknokraft Canada Inc."], WEBSITE_LAUNCH_DATE: "2026-09-29",
  torontoDateKey: () => "2026-10-01", getWebsiteLaunchReadiness: async () => ({ blockers: ["Agreement not yet sent or accepted"] }),
}));

import { createLeadgenCampaign, updateLeadgenCampaign } from "@/lib/leadgen-campaign-admin";

const form = (over = {}) => ({ name: "Oakville Pet Care", industry: "Pet care", territory: "Oakville, ON", description: "Book consults", script: "", status: "paused", startDate: "", adminNotes: "internal", agentIds: ["a1"], ...over });

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  writes.length = 0;
  db.leadgen_clients = [
    { id: "cl1", name: "Teknokraft Canada Inc.", active: true, is_internal_test: false },
    { id: "cl2", name: "Other", active: true, is_internal_test: false },
    { id: "test", name: "Test", active: true, is_internal_test: true },
  ];
  db.leadgen_users = [{ id: "a1", role: "agent", active: true }, { id: "a2", role: "agent", active: false }];
  db.leadgen_campaigns = [{ id: "c1", client_id: "cl2", name: "Existing", status: "active" }];
  db.leadgen_campaign_agents = [{ campaign_id: "c1", agent_id: "a1" }];
});

describe("createLeadgenCampaign", () => {
  it("writes the existing campaign model + agent access + admin notes only", async () => {
    const c = await createLeadgenCampaign("cl1", form(), "admin1");
    expect(c).toMatchObject({ clientId: "cl1", name: "Oakville Pet Care", status: "paused", adminNotes: "internal", agentIds: ["a1"], industry: "Pet care", territory: "Oakville, ON" });
    expect(db.leadgen_campaigns.find((r) => r.name === "Oakville Pet Care")).toMatchObject({ client_id: "cl1", created_by: "admin1", call_script_text: null });
    expect([...new Set(writes)].sort()).toEqual(["insert:leadgen_campaigns", "upsert:leadgen_campaign_admin_notes", "upsert:leadgen_campaign_agents"]);
  });
  it("keeps launch gating for website-launch clients when created Active", async () => {
    await expect(createLeadgenCampaign("cl1", form({ status: "active" }), "admin1")).rejects.toThrow(/Save as Paused/);
    expect(db.leadgen_campaigns).toHaveLength(1);
  });
  it("blocks test-only clients, duplicate names and inactive agents", async () => {
    await expect(createLeadgenCampaign("test", form(), "x")).rejects.toThrow(/test-only/);
    await expect(createLeadgenCampaign("cl2", form({ name: "existing" }), "x")).rejects.toThrow(/already has a campaign/);
    await expect(createLeadgenCampaign("cl1", form({ agentIds: ["a2"] }), "x")).rejects.toThrow(/active agent/);
  });
});

describe("updateLeadgenCampaign", () => {
  it("edits campaign fields only; never touches other tables or the client", async () => {
    db.leadgen_leads = [{ id: "l1", campaign_id: "c1" }];
    const c = await updateLeadgenCampaign("c1", form({ name: "Renamed", status: "completed", agentIds: [] }), "admin1");
    expect(c).toMatchObject({ name: "Renamed", status: "completed", clientId: "cl2", agentIds: ["a1"] });
    expect(db.leadgen_campaign_agents).toEqual([{ campaign_id: "c1", agent_id: "a1" }]); // never removed
    expect(db.leadgen_leads).toEqual([{ id: "l1", campaign_id: "c1" }]);
    expect([...new Set(writes)].sort()).toEqual(["update:leadgen_campaigns", "upsert:leadgen_campaign_admin_notes"]);
  });
});
