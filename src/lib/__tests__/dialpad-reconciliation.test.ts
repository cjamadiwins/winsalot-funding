import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDialpadDailyCsv } from "../dialpad-report";
import { listDialpadUserStatisticsCsvs } from "../dialpad-csv-source";
import {
  agentKeyFor,
  aggregateCrmCalls,
  buildReconciliationReport,
  matchTolerance,
  mergeDialpadFiles,
  type CrmCallInput,
  type DialpadFileInput,
} from "../dialpad-reconciliation";

const HEADER = "date,user_id,name,email,type,all_calls,inbound_calls,outbound_calls";
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n");
const line = (date: string, email: string, all: number, out: number) => `${date},1,Winsalot Corp.,${email},user,${all},${all - out},${out}`;
const placeholder = (date: string) => `${date},,,,user,0,0,0`;

const file = (fileName: string, ...lines: string[]): DialpadFileInput => {
  const parsed = parseDialpadDailyCsv(csv(...lines));
  return { fileName, ...parsed };
};

const HENRY = agentKeyFor("Henry Osuji");
const GOODNESS = agentKeyFor("Goodness Ugbana");
const names = new Map([[HENRY, "Henry Osuji"], [GOODNESS, "Goodness Ugbana"]]);
const WIDE = { agentKey: "all", campaign: "all", from: "2026-01-01", to: "2026-12-31" };

describe("parseDialpadDailyCsv", () => {
  it("keeps day-level rows and records placeholder days as covered", () => {
    const parsed = parseDialpadDailyCsv(csv(line("2026-09-25", "agent@winsalotcorp.com", 110, 100), placeholder("2026-09-26")));
    expect(parsed.dates).toEqual(["2026-09-25", "2026-09-26"]);
    expect(parsed.rows).toEqual([
      { date: "2026-09-25", agentName: "Winsalot Corp.", agentEmail: "agent@winsalotcorp.com", totalCalls: 110, outboundCalls: 100, inboundCalls: 10 },
    ]);
  });
});

describe("mergeDialpadFiles", () => {
  it("counts an overlapping day once when two weekly exports repeat it", () => {
    const a = file("a.csv", line("2026-09-04", "agent@winsalotcorp.com", 99, 94), line("2026-09-05", "agent@winsalotcorp.com", 10, 9));
    const b = file("b.csv", line("2026-09-04", "agent@winsalotcorp.com", 99, 94), line("2026-09-08", "agent@winsalotcorp.com", 20, 18));
    const merged = mergeDialpadFiles([a, b]);
    const outbound = [...merged.days.values()].reduce((sum, d) => sum + d.outbound, 0);
    expect(outbound).toBe(94 + 9 + 18);
    expect(merged.duplicateAgentDays).toBe(1);
    expect(merged.overlappingDates).toEqual(["2026-09-04", "2026-09-05"]);
    expect(merged.conflicts).toHaveLength(0);
  });

  it("is unaffected by upload order and by byte-identical duplicate files", () => {
    const a = file("a.csv", line("2026-09-11", "agent2@winsalotcorp.com", 27, 25));
    const dup = file("a (1).csv", line("2026-09-11", "agent2@winsalotcorp.com", 27, 25));
    const forward = mergeDialpadFiles([a, dup]);
    const reverse = mergeDialpadFiles([dup, a]);
    expect([...forward.days.values()].map((d) => d.outbound)).toEqual([25]);
    expect([...reverse.days.values()].map((d) => d.outbound)).toEqual([25]);
  });

  it("flags a genuine conflict and keeps the later export instead of summing both", () => {
    const early = file("early.csv", line("2026-09-04", "agent@winsalotcorp.com", 90, 80));
    const late = file("late.csv", line("2026-09-04", "agent@winsalotcorp.com", 99, 94), line("2026-09-11", "agent@winsalotcorp.com", 1, 1));
    const merged = mergeDialpadFiles([early, late]);
    expect(merged.days.get(`${HENRY}|2026-09-04`)?.outbound).toBe(94);
    expect(merged.conflicts).toEqual([
      expect.objectContaining({ date: "2026-09-04", kept: 94, dropped: 80, keptFile: "late.csv", droppedFile: "early.csv" }),
    ]);
  });
});

describe("buildReconciliationReport", () => {
  const dialpad = mergeDialpadFiles([
    file(
      "week.csv",
      line("2026-09-28", "agent@winsalotcorp.com", 105, 100),
      line("2026-09-28", "agent2@winsalotcorp.com", 60, 50),
      line("2026-09-28", "info@winsalotcorp.com", 4, 4),
      placeholder("2026-09-29")
    ),
  ]);
  const crm: CrmCallInput[] = [
    { source: "lead", agentKey: HENRY, date: "2026-09-28", campaignId: "camp-1", count: 60 },
    { source: "growth", agentKey: HENRY, date: "2026-09-28", campaignId: null, count: 38 },
    { source: "lead", agentKey: GOODNESS, date: "2026-09-28", campaignId: "camp-1", count: 20 },
    // Not covered by any Dialpad export: reported, never compared.
    { source: "lead", agentKey: GOODNESS, date: "2026-10-05", campaignId: "camp-2", count: 7 },
  ];

  it("shows calls recorded, the difference and calls missing from the CRM per agent", () => {
    const report = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: WIDE });
    const henry = report.agents.find((a) => a.agentKey === HENRY)!;
    expect(henry).toMatchObject({ dialpadOutbound: 100, crmLead: 60, crmGrowth: 38, crmTotal: 98, difference: -2, status: "matched" });
    const goodness = report.agents.find((a) => a.agentKey === GOODNESS)!;
    expect(goodness).toMatchObject({ dialpadOutbound: 50, crmComparable: 20, missingFromCrm: 30, status: "crm_lower", coveragePct: 40 });
    expect(goodness.crmOutsideCoverage).toBe(7);
    expect(report.quality.uncoveredDatesWithCrmActivity).toEqual(["2026-10-05"]);
  });

  it("excludes the Dialpad admin seat from agent comparison but reports it", () => {
    const report = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: WIDE });
    expect(report.agents.map((a) => a.agentKey).sort()).toEqual([GOODNESS, HENRY].sort());
    expect(report.adminSeatCalls).toBe(4);
  });

  it("treats a covered day with no agent row as zero Dialpad calls, and flags CRM calls on it", () => {
    const withExtra = [...crm, { source: "lead" as const, agentKey: HENRY, date: "2026-09-29", campaignId: "camp-1", count: 30 }];
    const report = buildReconciliationReport({ dialpad, crmCalls: withExtra, agentNames: names, filters: WIDE });
    const row = report.daily.find((d) => d.agentKey === HENRY && d.date === "2026-09-29")!;
    expect(row).toMatchObject({ dialpadOutbound: 0, crmTotal: 30, extraInCrm: 30, status: "crm_higher" });
  });

  it("filters by agent and by date", () => {
    const one = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: { ...WIDE, agentKey: HENRY } });
    expect(one.agents).toHaveLength(1);
    expect(one.totals.crmTotal).toBe(98);
    const none = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: { ...WIDE, from: "2026-10-01", to: "2026-10-31" } });
    expect(none.totals.dialpadOutbound).toBe(0);
    expect(none.totals.crmTotal).toBe(7);
    expect(none.totals.status).toBe("crm_only");
  });

  it("filters by campaign and stops comparing against Dialpad, which has no campaign data", () => {
    const report = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: { ...WIDE, campaign: "camp-1" } });
    expect(report.dialpadComparable).toBe(false);
    expect(report.totals).toMatchObject({ crmTotal: 80, dialpadOutbound: 0, difference: null, status: "campaign_filtered" });
    const growth = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: { ...WIDE, campaign: "growth" } });
    expect(growth.totals.crmTotal).toBe(38);
  });

  it("groups into Monday-based weeks", () => {
    const report = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: WIDE });
    expect(report.weekly.map((w) => w.weekStart)).toContain("2026-09-28");
    expect(report.weekly.find((w) => w.weekStart === "2026-09-28" && w.agentKey === HENRY)).toMatchObject({ weekEnd: "2026-10-04", crmTotal: 98 });
  });

  it("uses a tolerance so small timing differences are not flagged as missing", () => {
    expect(matchTolerance(10)).toBe(3);
    expect(matchTolerance(200)).toBe(10);
  });
});

describe("aggregateCrmCalls", () => {
  it("buckets by Toronto day, not UTC", () => {
    const rows = [
      { agentKey: HENRY, createdAt: "2026-10-19T03:30:00Z", campaignId: "c" }, // 23:30 on Oct 18 in Toronto
      { agentKey: HENRY, createdAt: "2026-10-19T15:00:00Z", campaignId: "c" },
    ];
    expect(aggregateCrmCalls(rows, "lead").map((r) => [r.date, r.count]).sort()).toEqual([["2026-10-18", 1], ["2026-10-19", 1]]);
  });

  it("ignores campaign ids for the Growth CRM, which has no campaigns", () => {
    expect(aggregateCrmCalls([{ agentKey: HENRY, createdAt: "2026-10-19T15:00:00Z", campaignId: "x" }], "growth")[0].campaignId).toBeNull();
  });
});

describe("committed Dialpad exports", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const files = listDialpadUserStatisticsCsvs(root).map((candidate) => {
    const parsed = parseDialpadDailyCsv(readFileSync(candidate.filePath, "utf8"));
    return { fileName: candidate.fileName, ...parsed };
  });

  it("counts each overlapping agent-day once across the real weekly exports", () => {
    const merged = mergeDialpadFiles(files);
    const naive = files.reduce((sum, f) => sum + f.rows.filter((r) => r.agentEmail === "agent2@winsalotcorp.com").reduce((s, r) => s + r.outboundCalls, 0), 0);
    const deduped = [...merged.days.values()].filter((d) => d.agentKey === GOODNESS).reduce((s, d) => s + d.outbound, 0);
    expect(deduped).toBeLessThan(naive);
    expect(merged.conflicts).toEqual([]);
    expect(merged.duplicateAgentDays).toBeGreaterThan(0);
    // Goodness: 559 + 479 + 413 + 432 + 423 outbound across five exports,
    // less the 94 (Sep 4) and 25 (Sep 11) outbound calls two exports repeat,
    // and a duplicate upload of the Sep 11-18 file (432).
    expect(deduped).toBe(559 + 479 + 413 + 432 + 423 - 94 - 25);
  });
});

describe("calls made before CRM call logging started", () => {
  const dialpad = mergeDialpadFiles([
    file(
      "w.csv",
      line("2026-08-24", "agent@winsalotcorp.com", 300, 290),
      line("2026-09-09", "agent@winsalotcorp.com", 55, 50),
      line("2026-08-24", "agent3@example.com", 10, 10)
    ),
  ]);
  const crm: CrmCallInput[] = [{ source: "growth", agentKey: HENRY, date: "2026-09-09", campaignId: null, count: 48 }];

  it("excludes Dialpad activity before the agent's first CRM call log from the comparison and reports it apart", () => {
    const report = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: WIDE });
    const henry = report.agents.find((a) => a.agentKey === HENRY)!;
    expect(henry).toMatchObject({ dialpadOutbound: 50, dialpadBeforeCrm: 290, crmComparable: 48, difference: -2, status: "matched" });
    const august = report.daily.find((d) => d.agentKey === HENRY && d.date === "2026-08-24")!;
    expect(august).toMatchObject({ status: "before_crm", missingFromCrm: 0, dialpadBeforeCrm: 290 });
  });

  it("still flags an agent who has Dialpad calls but has never logged any in the CRM", () => {
    const report = buildReconciliationReport({ dialpad, crmCalls: crm, agentNames: names, filters: WIDE });
    const unlogged = report.agents.find((a) => a.agentKey === "agent3@example.com")!;
    expect(unlogged).toMatchObject({ dialpadOutbound: 10, crmTotal: 0, missingFromCrm: 10, status: "crm_lower" });
  });
});
