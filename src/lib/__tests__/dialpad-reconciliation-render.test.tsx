import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DialpadReconciliationReport from "../../components/dialpad/DialpadReconciliationReport";
import { agentKeyFor, buildReconciliationReport, mergeDialpadFiles } from "../dialpad-reconciliation";

const HENRY = agentKeyFor("Henry Osuji");
const dialpad = mergeDialpadFiles([
  {
    fileName: "w.csv",
    dates: ["2026-08-24", "2026-09-09"],
    rows: [
      { date: "2026-08-24", agentName: "Winsalot Corp.", agentEmail: "agent@winsalotcorp.com", totalCalls: 300, outboundCalls: 290, inboundCalls: 10 },
      { date: "2026-09-09", agentName: "Winsalot Corp.", agentEmail: "agent@winsalotcorp.com", totalCalls: 55, outboundCalls: 50, inboundCalls: 5 },
    ],
  },
]);
const names = new Map([[HENRY, "Henry Osuji"]]);
const render = (campaign = "all") => {
  const filters = { agent: "all", campaign, from: "2026-08-01", to: "2026-10-31" };
  const report = buildReconciliationReport({
    dialpad,
    crmCalls: [{ source: "growth", agentKey: HENRY, date: "2026-09-09", campaignId: null, count: 48 }],
    agentNames: names,
    filters: { agentKey: "all", campaign, from: filters.from, to: filters.to },
  });
  return renderToStaticMarkup(
    createElement(DialpadReconciliationReport, {
      data: { report, filters, options: { agents: [{ key: HENRY, name: "Henry Osuji" }], campaigns: [] }, skippedFiles: [], generatedAt: "2026-10-19T00:00:00Z" },
      basePath: "/x",
      crmLabel: "Lead Generation CRM",
    })
  );
};
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, "'").replace(/\s+/g, " ");

describe("DialpadReconciliationReport rendering", () => {
  it("keeps spaces between inline text and values (regression: joined words)", () => {
    const html = render().replace(/<!-- -->/g, "");
    expect(html).toContain("Lead Generation CRM administrators");
    expect(html).toMatch(/290 Dialpad outbound calls pre-date/);
    expect(html).toMatch(/Outbound vs\. CRM\.<\/strong> The CRM Call Log/);
  });

  it("shows the Dialpad count for pre-CRM rows instead of a bare dash", () => {
    expect(text(render())).toContain("290 (before CRM)");
  });

  it("uses a plain GET filter form and no write controls", () => {
    const html = render();
    expect(html).toContain('method="get"');
    expect(html).not.toMatch(/method="post"/i);
    expect(html).not.toMatch(/<input[^>]+type="hidden"/);
  });

  it("explains that a campaign filter is CRM-only", () => {
    expect(text(render("growth"))).toContain("campaign filter shows CRM call counts only");
  });
});
