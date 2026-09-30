import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { overallScriptLabel, relativeActivityLabel, summarizeByAgent, type ScriptStatusDetail } from "../script-status-summary";
import { AgentScriptDetailsTable, type ScriptDetailRow } from "@/components/script-status/AgentScriptSummaryList";

const now = Date.parse("2026-09-30T15:00:00.000Z");
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
const d = (over: Partial<ScriptStatusDetail>): ScriptStatusDetail => ({ agentId: "a", agentName: "A", state: "closed", openedAt: null, lastActivityAt: null, campaignLabel: "C", ...over });

describe("summarizeByAgent", () => {
  it("returns exactly one summary per agent with campaign count", () => {
    const out = summarizeByAgent([
      ...Array.from({ length: 6 }, (_, i) => d({ agentId: "h", agentName: "Henry Osuji", campaignLabel: `C${i}` })),
      ...Array.from({ length: 3 }, (_, i) => d({ agentId: "g", agentName: "Goodness Ugbana", campaignLabel: `G${i}` })),
    ]);
    expect(out.map((s) => [s.agentName, s.campaignCount])).toEqual([["Goodness Ugbana", 3], ["Henry Osuji", 6]]);
  });

  it("overall Open if any campaign is open, and points at the open campaign as Current", () => {
    const [s] = summarizeByAgent([
      d({ state: "closed", campaignLabel: "Oakville Pet Care", lastActivityAt: iso(30) }),
      d({ state: "open", campaignLabel: "Brandon Pet Groomer", lastActivityAt: iso(2) }),
    ]);
    expect(s.isOpen).toBe(true);
    expect(s.tone).toBe("green");
    expect(s.focus).toEqual({ kind: "current", label: "Brandon Pet Groomer" });
    expect(s.lastActivityAt).toBe(iso(2));
    expect(overallScriptLabel(s.isOpen)).toBe("Script Open");
  });

  it("closed agent shows the most recently active campaign as Last, amber only when it needs attention", () => {
    const [closed] = summarizeByAgent([d({ state: "closed", campaignLabel: "A", lastActivityAt: iso(90) }), d({ state: "inactive", campaignLabel: "Oakville Pet Care", lastActivityAt: iso(10) })]);
    expect(closed.isOpen).toBe(false);
    expect(closed.tone).toBe("gray");
    expect(closed.focus).toEqual({ kind: "last", label: "Oakville Pet Care" });
    const [working] = summarizeByAgent([d({ state: "closed_working" }), d({ state: "inactive" })]);
    expect(working.tone).toBe("amber");
    const [none] = summarizeByAgent([d({ state: "never_opened" })]);
    expect(none.focus).toBeNull();
    expect(none.lastActivityAt).toBeNull();
  });

  it("formats relative activity", () => {
    expect(relativeActivityLabel(null, now)).toBe("—");
    expect(relativeActivityLabel(iso(0), now)).toBe("just now");
    expect(relativeActivityLabel(iso(2), now)).toBe("2 min ago");
    expect(relativeActivityLabel(iso(180), now)).toBe("3 hr ago");
    expect(relativeActivityLabel(iso(60 * 50), now)).toBe("2 days ago");
  });
});

describe("popup details table", () => {
  const rows: ScriptDetailRow[] = [
    { ...d({ state: "open", openedAt: iso(5), lastActivityAt: iso(1) }), key: "1", owner: "Teknokraft Canada Inc.", campaign: "Toronto Snow Removal", list: "Snow Removal — No Website", service: "Snow Removal", previewSegmentId: "s1" },
    { ...d({ state: "closed_working" }), key: "2", owner: "Hidebrandt Web Services", campaign: "Winnipeg Pet Care", list: null, service: null, previewSegmentId: "s2" },
  ];
  it("shows owner, campaign/list, service, state, times and a Preview Script action per campaign", () => {
    const html = renderToStaticMarkup(createElement(AgentScriptDetailsTable, { rows, ownerHeader: "Client", onPreview: () => undefined }));
    for (const h of ["Client", "Campaign / List", "Service / Industry", "Opened At", "Last Activity"]) expect(html).toContain(h);
    expect(html).toContain("Teknokraft Canada Inc.");
    expect(html).toContain("Hidebrandt Web Services");
    expect(html).toContain("Snow Removal — No Website");
    expect(html).toContain("Script Open");
    expect(html).toContain("Script Closed — working list");
    expect(html.match(/Preview Script/g)?.length).toBe(2);
    expect(html).not.toMatch(/rose|red-/);
  });
  it("Growth owner header", () => {
    const html = renderToStaticMarkup(createElement(AgentScriptDetailsTable, { rows: [{ ...rows[0], owner: "Winsalot Corp" }], ownerHeader: "Campaign Owner", onPreview: () => undefined }));
    expect(html).toContain("Campaign Owner");
    expect(html).toContain("Winsalot Corp");
  });
});
