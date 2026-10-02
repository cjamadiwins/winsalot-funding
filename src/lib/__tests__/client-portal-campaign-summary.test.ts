import { describe, expect, it } from "vitest";
import {
  buildClientCampaignSummary,
  deriveAssignedTeam,
  deriveTargeting,
  pickUmbrellaCampaign,
  stripClientNamePrefix,
  type SummaryCallList,
  type SummaryCampaign,
} from "../client-portal-campaign-summary";

function campaign(id: string, name: string, status: SummaryCampaign["status"], created: string, extra: Partial<SummaryCampaign> = {}): SummaryCampaign {
  return { id, name, status, created_at: created, start_date: null, appointment_goal: null, qualification_criteria: [], ...extra };
}

function list(campaignId: string, industry: string, territory: string, agents: string[], extra: Partial<SummaryCallList> = {}): SummaryCallList {
  return { campaignId, status: "active", deployedAt: "2026-09-30T00:00:00Z", leadCount: 1, industry, territory, agentNames: agents, ...extra };
}

const signed8to12 = [{ status: "signed", min: 8, max: 12, createdAt: "2026-09-27" }];

// Mirrors production: umbrella + per-market rows, Henry only on undeployed / empty lists.
const hidebrandtCampaigns = [
  campaign("hid-brandon", "Hidebrandt Web Services — Brandon Pet Groomer / Pet Care", "active", "2026-09-30T20:27:00Z", { start_date: "2026-09-30", qualification_criteria: ["Brandon-only criterion"] }),
  campaign("hid-winnipeg", "Hidebrandt Web Services — Winnipeg Pet Care", "active", "2026-09-30T19:12:00Z", { start_date: "2026-09-30" }),
  campaign("hid-umbrella", "Hidebrandt Web Services – Website Services Lead Generation", "active", "2026-09-27T23:53:00Z", { start_date: "2026-09-29" }),
];
const hidebrandtLists = [
  list("hid-umbrella", "Auto Repair Shops", "Toronto, Ontario", ["Goodness Ugbana"]),
  list("hid-umbrella", "Painting Companies", "Ottawa, Ontario", ["Goodness Ugbana"]),
  list("hid-umbrella", "Auto Repair Shops", "Winnipeg, Manitoba", ["Henry Osuji"], { deployedAt: null }),
  list("hid-umbrella", "Painting Companies", "Winnipeg, Manitoba", ["Henry Osuji"], { leadCount: 0 }),
  list("hid-brandon", "Pet Groomer / Pet Care", "Brandon, Manitoba", ["Goodness Ugbana"]),
  list("hid-winnipeg", "Pet Sitter / Pet Care", "Winnipeg, Manitoba", ["Goodness Ugbana"]),
];

describe("buildClientCampaignSummary - Hidebrandt", () => {
  const summary = buildClientCampaignSummary({ clientName: "Hidebrandt Web Services", isInternalTest: false, campaigns: hidebrandtCampaigns, lists: hidebrandtLists, agreements: signed8to12 });

  it("uses the umbrella campaign, never the newest per-market row", () => {
    expect(summary.campaignName).toBe("Website Services Lead Generation");
    expect(summary.campaignName).not.toMatch(/Brandon|Pet/);
  });
  it("shows only the agent with a qualifying list (Henry's undeployed / empty lists excluded)", () => {
    expect(summary.assignedTeam).toEqual(["Goodness Ugbana"]);
  });
  it("summarises multiple industries and markets", () => {
    expect(summary.targeting).toBe("Multiple Industries • Multiple Markets");
  });
  it("shows the signed appointment target, active status and earliest start", () => {
    expect(summary.appointmentTarget).toBe("8–12");
    expect(summary.status).toBe("active");
    expect(summary.campaignStart).toBe("2026-09-29");
  });
  it("does not pull criteria from a per-market row", () => {
    expect(summary.qualificationCriteria).toEqual(["Brandon-only criterion"]);
  });
});

describe("buildClientCampaignSummary - Teknokraft", () => {
  const campaigns = [
    campaign("tek-oakville", "Teknokraft Canada Inc. — Oakville Pet Care", "active", "2026-09-30T20:57:00Z", { start_date: "2026-10-01" }),
    campaign("tek-snow", "Teknokraft Canada Inc. — Toronto Snow Removal", "active", "2026-09-29T02:28:00Z", { start_date: "2026-10-01" }),
    campaign("tek-umbrella", "Teknokraft Canada Inc. – Website Design & SEO Lead Generation", "paused", "2026-09-27T23:07:00Z", { start_date: "2026-09-29" }),
  ];
  const lists = [list("tek-oakville", "Pet Sitter / Pet Care", "Oakville, Ontario", ["Henry Osuji"]), list("tek-snow", "Snow Removal Services", "Toronto, Ontario", ["Henry Osuji"])];
  const summary = buildClientCampaignSummary({ clientName: "Teknokraft Canada Inc.", isInternalTest: false, campaigns, lists, agreements: signed8to12 });

  it("names the (paused) umbrella but reports the overall status as Active", () => {
    expect(summary.campaignName).toBe("Website Design & SEO Lead Generation");
    expect(summary.status).toBe("active");
  });
  it("shows Henry Osuji only", () => expect(summary.assignedTeam).toEqual(["Henry Osuji"]));
  it("summarises targeting and start date", () => {
    expect(summary.targeting).toBe("Multiple Industries • Multiple Markets");
    expect(summary.campaignStart).toBe("2026-09-29");
  });
});

describe("deriveAssignedTeam", () => {
  const camps = [{ id: "c1", status: "active" as const }];

  it("adds a second agent automatically when they hold a qualifying list, sorted and de-duplicated", () => {
    const team = deriveAssignedTeam(camps, [list("c1", "A", "X", ["Henry Osuji", "Goodness Ugbana"]), list("c1", "B", "Y", ["goodness ugbana"])], false);
    expect(team).toEqual(["Goodness Ugbana", "Henry Osuji"]);
  });
  it("removes an agent once their qualifying lists are gone", () => {
    const before = deriveAssignedTeam(camps, [list("c1", "A", "X", ["Henry Osuji"])], false);
    const after = deriveAssignedTeam(camps, [list("c1", "A", "X", [])], false);
    expect(before).toEqual(["Henry Osuji"]);
    expect(after).toEqual([]);
  });
  it.each([
    ["undeployed", { deployedAt: null }],
    ["zero-lead", { leadCount: 0 }],
    ["draft", { status: "draft" }],
    ["archived", { status: "archived" }],
    ["completed", { status: "completed" }],
  ])("excludes %s lists", (_label, extra) => {
    expect(deriveAssignedTeam(camps, [list("c1", "A", "X", ["Henry Osuji"], extra)], false)).toEqual([]);
  });
  it("excludes lists on paused or completed campaigns", () => {
    for (const status of ["paused", "completed"] as const) {
      expect(deriveAssignedTeam([{ id: "c1", status }], [list("c1", "A", "X", ["Henry Osuji"])], false)).toEqual([]);
    }
  });
  it("excludes the internal test client", () => {
    expect(deriveAssignedTeam(camps, [list("c1", "A", "X", ["Henry Osuji"])], true)).toEqual([]);
  });
  it("ignores lists belonging to a campaign that is not the client's", () => {
    expect(deriveAssignedTeam(camps, [list("other", "A", "X", ["Henry Osuji"])], false)).toEqual([]);
  });
});

describe("deriveTargeting", () => {
  const camps = [{ id: "c1", status: "active" as const }];
  it("names a single industry and market", () => {
    expect(deriveTargeting(camps, [list("c1", "Snow Removal Services", "Toronto, Ontario", []), list("c1", "snow removal services", "toronto, ontario", [])])).toBe("Snow Removal Services • Toronto, Ontario");
  });
  it("collapses each side independently", () => {
    expect(deriveTargeting(camps, [list("c1", "Pet Care", "Toronto", []), list("c1", "Pet Care", "Ottawa", [])])).toBe("Pet Care • Multiple Markets");
    expect(deriveTargeting(camps, [list("c1", "A", "Toronto", []), list("c1", "B", "Toronto", [])])).toBe("Multiple Industries • Toronto");
  });
  it("is null when there are no live lists, and ignores draft lists", () => {
    expect(deriveTargeting(camps, [])).toBeNull();
    expect(deriveTargeting(camps, [list("c1", "A", "X", [], { status: "draft" })])).toBeNull();
  });
});

describe("campaign name, appointment target and status fallbacks", () => {
  it("picks the oldest campaign, tie-broken by id", () => {
    const picked = pickUmbrellaCampaign([campaign("b", "B", "active", "2026-01-01"), campaign("a", "A", "active", "2026-01-01"), campaign("c", "C", "active", "2025-01-01")]);
    expect(picked?.id).toBe("c");
    expect(pickUmbrellaCampaign([campaign("b", "B", "active", "2026-01-01"), campaign("a", "A", "active", "2026-01-01")])?.id).toBe("a");
    expect(pickUmbrellaCampaign([])).toBeNull();
  });
  it("strips the client-name prefix for en dash, em dash and hyphen, and keeps unprefixed names", () => {
    expect(stripClientNamePrefix("Acme Inc. – Lead Gen", "Acme Inc.")).toBe("Lead Gen");
    expect(stripClientNamePrefix("Acme Inc. — Lead Gen", "Acme Inc.")).toBe("Lead Gen");
    expect(stripClientNamePrefix("Q3 Growth Campaign", "Brent's Essentials")).toBe("Q3 Growth Campaign");
    expect(stripClientNamePrefix("Acme Inc. –", "Acme Inc.")).toBe("Acme Inc. –");
  });
  it("falls back to the campaign appointment goal; hides the row when none; ignores unsigned agreements", () => {
    const base = { clientName: "Mantra Collab", isInternalTest: false, lists: [] };
    const withGoal = buildClientCampaignSummary({ ...base, campaigns: [campaign("m", "Mantra Collab Business Applications", "active", "2026-08-23", { appointment_goal: 3 })], agreements: [{ status: "sent", min: 8, max: 12, createdAt: "x" }] });
    expect(withGoal.appointmentTarget).toBe("3");
    const none = buildClientCampaignSummary({ ...base, campaigns: [campaign("m", "Mantra Collab Business Applications", "active", "2026-08-23")], agreements: [] });
    expect(none.appointmentTarget).toBeNull();
    expect(none.assignedTeam).toEqual([]);
    expect(none.targeting).toBeNull();
  });
  it("reports Paused / Completed overall status and an empty summary with no campaigns", () => {
    const base = { clientName: "X", isInternalTest: false, lists: [], agreements: [] };
    expect(buildClientCampaignSummary({ ...base, campaigns: [campaign("a", "X – A", "paused", "1"), campaign("b", "X – B", "completed", "2")] }).status).toBe("paused");
    expect(buildClientCampaignSummary({ ...base, campaigns: [campaign("a", "X – A", "completed", "1")] }).status).toBe("completed");
    const empty = buildClientCampaignSummary({ ...base, campaigns: [] });
    expect(empty).toMatchObject({ campaignName: null, status: null, campaignStart: null });
  });
});
