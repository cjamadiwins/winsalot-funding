import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

// Minimal chainable stand-in for the service-role client: select().eq().maybeSingle().
vi.mock("../supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle: async () => ({ data: (tables[table] ?? []).find((row) => filters.every(([c, v]) => row[c] === v)) ?? null }),
      };
      return builder;
    },
  }),
}));

import { findAssignmentProblems, isProductionSegment, resolveSegmentAssignment, type AssignmentOverview } from "../leadgen-campaign-assignment";

beforeEach(() => {
  tables.leadgen_campaigns = [
    { id: "camp-hid", name: "Hidebrandt Campaign", status: "active", client_id: "cl-hid" },
    { id: "camp-paused", name: "Web6 Campaign", status: "paused", client_id: "cl-web6" },
    { id: "camp-test", name: "Website Design Lead Generation", status: "active", client_id: "cl-test" },
    { id: "camp-dead", name: "Old Campaign", status: "active", client_id: "cl-off" },
  ];
  tables.leadgen_clients = [
    { id: "cl-hid", name: "Hidebrandt Web Services", active: true, is_internal_test: false },
    { id: "cl-web6", name: "Web6 Solutions", active: true, is_internal_test: false },
    { id: "cl-test", name: "Winsalot Corp. Test", active: true, is_internal_test: true },
    { id: "cl-off", name: "Old Client", active: false, is_internal_test: false },
  ];
});

describe("resolveSegmentAssignment", () => {
  it("resolves the client from the call list's own campaign", async () => {
    expect(await resolveSegmentAssignment({ leadgen_campaign_id: "camp-hid" })).toEqual({
      state: "assigned",
      clientId: "cl-hid",
      clientName: "Hidebrandt Web Services",
      campaignId: "camp-hid",
      campaignName: "Hidebrandt Campaign",
      isInternalTest: false,
    });
  });

  it("never guesses: a list with no campaign (or a missing one) is unassigned", async () => {
    expect(await resolveSegmentAssignment({ leadgen_campaign_id: null })).toEqual({ state: "unassigned" });
    expect(await resolveSegmentAssignment({ leadgen_campaign_id: "does-not-exist" })).toEqual({ state: "unassigned" });
  });

  it("reports paused campaigns and inactive clients as inactive, not assigned", async () => {
    expect(await resolveSegmentAssignment({ leadgen_campaign_id: "camp-paused" })).toMatchObject({ state: "inactive", reason: "campaign_paused", clientName: "Web6 Solutions" });
    expect(await resolveSegmentAssignment({ leadgen_campaign_id: "camp-dead" })).toMatchObject({ state: "inactive", reason: "client_inactive" });
  });

  it("flags the internal test client", async () => {
    expect(await resolveSegmentAssignment({ leadgen_campaign_id: "camp-test" })).toMatchObject({ state: "assigned", isInternalTest: true });
  });
});

describe("findAssignmentProblems", () => {
  const campaign = (id: string, extra: Partial<AssignmentOverview["campaigns"][number]> = {}): AssignmentOverview["campaigns"][number] => ({
    id,
    name: id,
    status: "active",
    clientId: `client-${id}`,
    clientName: id,
    clientActive: true,
    isInternalTest: false,
    agentIds: [],
    ...extra,
  });
  const segment = (id: string, status: AssignmentOverview["segments"][number]["status"], campaignId: string | null): AssignmentOverview["segments"][number] => ({
    id,
    name: id,
    status,
    industry: null,
    territory: null,
    campaignName: null,
    campaignId,
    agentIds: [],
    leadCount: 0,
    callLogCount: 0,
  });

  it("only production lists count, and each problem type is reported separately", () => {
    const overview: AssignmentOverview = {
      agents: [],
      campaigns: [campaign("ok"), campaign("test", { isInternalTest: true }), campaign("paused", { status: "paused" })],
      segments: [
        segment("fine", "active", "ok"),
        segment("none", "active", null),
        segment("draft-none", "draft", null),
        segment("on-test", "completed", "test"),
        segment("paused-list", "active", "paused"),
      ],
    };
    const problems = findAssignmentProblems(overview);
    expect(problems.unassignedProduction.map((s) => s.id)).toEqual(["none"]);
    expect(problems.onInternalTestClient.map((s) => s.id)).toEqual(["on-test"]);
    expect(problems.pausedOrInactive.map((s) => s.id)).toEqual(["paused-list"]);
  });

  it("treats drafts as non-production", () => {
    expect(isProductionSegment("draft")).toBe(false);
    expect(isProductionSegment("archived")).toBe(false);
    expect(isProductionSegment("active")).toBe(true);
    expect(isProductionSegment("completed")).toBe(true);
  });
});
