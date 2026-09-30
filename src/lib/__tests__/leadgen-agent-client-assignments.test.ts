import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

import {
  assignmentWouldRestrictAgent,
  groupAgentClientAssignments,
  pickAttributionClient,
  removalWouldUnrestrictAgent,
} from "../leadgen-agent-active-client";

// Shaped like production: Teknokraft has two campaigns, Web6's is paused.
const campaigns = [
  { id: "hid", client_id: "c-hid" },
  { id: "tek-seo", client_id: "c-tek" },
  { id: "tek-snow", client_id: "c-tek" },
  { id: "web6", client_id: "c-web6" },
  { id: "old", client_id: "c-inactive" },
];
const manageable = new Set(["c-hid", "c-tek", "c-web6"]);

describe("groupAgentClientAssignments (reuses leadgen_campaign_agents rows)", () => {
  const rows = [
    { agent_id: "goodness", campaign_id: "hid" },
    { agent_id: "goodness", campaign_id: "tek-seo" },
    { agent_id: "goodness", campaign_id: "web6" },
    { agent_id: "henry", campaign_id: "hid" },
    { agent_id: "henry", campaign_id: "tek-seo" },
    { agent_id: "henry", campaign_id: "tek-snow" },
    { agent_id: "henry", campaign_id: "web6" },
    { agent_id: "henry", campaign_id: "old" },
  ];
  const result = groupAgentClientAssignments(rows, campaigns, manageable, [
    { id: "goodness", current_campaign_id: "hid" },
    { id: "henry", current_campaign_id: "tek-snow" },
    { id: "cj", current_campaign_id: null },
  ]);

  it("shows an agent's existing assignments as clients, with their primary", () => {
    const goodness = result.get("goodness")!;
    expect(goodness.clients.map((c) => c.clientId).sort()).toEqual(["c-hid", "c-tek", "c-web6"]);
    expect(goodness.primaryClientId).toBe("c-hid");
  });

  it("derives the primary client from whichever of its campaigns is current", () => {
    const henry = result.get("henry")!;
    expect(henry.primaryClientId).toBe("c-tek");
    expect(henry.clients.find((c) => c.clientId === "c-tek")!.rows).toBe(2);
  });

  it("counts every row toward restriction, even rows for clients that aren't shown", () => {
    expect(result.get("henry")!.totalRows).toBe(5);
    expect(result.get("henry")!.clients.some((c) => c.clientId === "c-inactive")).toBe(false);
  });

  it("an agent with no rows is unassigned and unrestricted", () => {
    const cj = result.get("cj")!;
    expect(cj.clients).toEqual([]);
    expect(cj.totalRows).toBe(0);
    expect(cj.primaryClientId).toBeNull();
  });
});

describe("agents only ever work Admin-assigned clients", () => {
  it("assigning a client never needs an 'unrestricted' confirmation", () => {
    expect(assignmentWouldRestrictAgent(0)).toBe(false);
    expect(assignmentWouldRestrictAgent(3)).toBe(false);
  });

  it("removing the last client leaves the agent with NO clients, never all of them", () => {
    expect(removalWouldUnrestrictAgent(3, 3)).toBe(false);
    expect(removalWouldUnrestrictAgent(1, 1)).toBe(false);
  });
});

describe("attribution priority is unchanged with several assigned clients", () => {
  const hidebrandt = { id: "c-hid" };
  const web6 = { id: "c-web6" };
  const primary = { id: "c-tek" };

  it("a call list's own client controls attribution, whatever the agent's clients are", () => {
    expect(pickAttributionClient(hidebrandt, primary)).toEqual({ source: "call_list", client: hidebrandt });
    expect(pickAttributionClient(web6, primary)).toEqual({ source: "call_list", client: web6 });
  });

  it("falls back to the Primary client, then to no selection", () => {
    expect(pickAttributionClient(null, primary)).toEqual({ source: "agent_default", client: primary });
    expect(pickAttributionClient(null, null)).toEqual({ source: "none", client: null });
  });
});
