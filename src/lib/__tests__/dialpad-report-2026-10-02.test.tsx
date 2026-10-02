import React from "react";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { extractDateRangeFromCsv, parseDialpadCsv } from "@/lib/dialpad-report";
import { findLatestDialpadUserStatisticsCsv } from "@/lib/dialpad-csv-source";
import DialpadPerformanceDashboard from "@/components/dialpad/DialpadPerformanceDashboard";
import type { DialpadDashboardData, DialpadUserStatRow } from "@/lib/dialpad-report-data";

// Pinned to the weekly export committed to the repo root for
// Sep 25 - Oct 2, 2026: proves the EXISTING importer maps it correctly (no
// second reporting system) and the existing dashboard shows it.
const FILE = "User_Statistics(2026-09-25-2026-10-02)-20261002.csv";
const csv = readFileSync(path.join(process.cwd(), FILE), "utf8");
const byEmail = (email: string) => parseDialpadCsv(csv).summaries.find((s) => s.agentEmail === email)!;

describe("Dialpad User Statistics 2026-09-25 -> 2026-10-02", () => {
  it("detects the reporting period from the filename and the CSV contents", () => {
    expect(extractDateRangeFromCsv(csv)).toEqual({ periodStart: "2026-09-25", periodEnd: "2026-10-02" });
    const dir = mkdtempSync(path.join(tmpdir(), "dialpad-"));
    writeFileSync(path.join(dir, FILE), csv);
    writeFileSync(path.join(dir, "User_Statistics(2026-09-11-2026-09-18)-20260918.csv"), "x");
    const latest = findLatestDialpadUserStatisticsCsv(dir);
    expect(latest).toMatchObject({ fileName: FILE, periodStart: "2026-09-25", periodEnd: "2026-10-02" });
  });

  it("maps each Dialpad seat to the existing CRM agent and totals every day of the week", () => {
    const { summaries } = parseDialpadCsv(csv);
    expect(summaries).toHaveLength(3);
    expect(byEmail("agent@winsalotcorp.com")).toMatchObject({ agentName: "Henry Osuji", totalCalls: 549, placedCalls: 532, inboundCalls: 17, answeredCalls: 468, missedCalls: 4, voicemails: 2, totalDurationSeconds: 25656, averageDurationSeconds: 47 });
    expect(byEmail("agent2@winsalotcorp.com")).toMatchObject({ agentName: "Goodness Ugbana", totalCalls: 440, placedCalls: 423, inboundCalls: 17, answeredCalls: 361, missedCalls: 7, voicemails: 0, totalDurationSeconds: 11085, averageDurationSeconds: 25 });
    expect(byEmail("info@winsalotcorp.com")).toMatchObject({ agentName: "C.J Amadi", totalCalls: 4, placedCalls: 4, answeredCalls: 4, missedCalls: 0, totalDurationSeconds: 3851, averageDurationSeconds: 963 });
  });

  it("drops the zero-activity placeholder days instead of inventing a user", () => {
    expect(parseDialpadCsv(csv).summaries.map((s) => s.agentName).sort()).toEqual(["C.J Amadi", "Goodness Ugbana", "Henry Osuji"]);
  });
});

function statRow(email: string, role: "admin" | "agent", i: number): DialpadUserStatRow {
  const s = byEmail(email);
  return { id: `s${i}`, report_id: "r1", agent_name: s.agentName, agent_email: s.agentEmail, agent_role: role, total_calls: s.totalCalls, placed_calls: s.placedCalls, answered_calls: s.answeredCalls, missed_calls: s.missedCalls, inbound_calls: s.inboundCalls, voicemails: s.voicemails, total_duration_seconds: s.totalDurationSeconds, average_duration_seconds: s.averageDurationSeconds };
}
const report = { id: "r1", period_start: "2026-09-25", period_end: "2026-10-02", source_file_name: FILE, source_workspace: "growth" as const, imported_at: "2026-10-02T00:00:00Z", imported_by_name: "x", user_count: 3, call_count: 993 };
const render = (summaries: DialpadUserStatRow[], audience: "admin" | "agent") => {
  const data: DialpadDashboardData = { reports: [report], selectedReport: report, summaries, calls: [] };
  return renderToStaticMarkup(<DialpadPerformanceDashboard workspace="growth" basePath="/admin/crm/dialpad" data={data} audience={audience} />);
};

describe("Dialpad Performance dashboard with this report", () => {
  it("Admin sees the full team, the report dates and the KPI set", () => {
    const html = render([statRow("agent@winsalotcorp.com", "agent", 1), statRow("agent2@winsalotcorp.com", "agent", 2), statRow("info@winsalotcorp.com", "admin", 3)], "admin");
    for (const text of ["Sep 25", "Oct 2", "Henry Osuji", "Goodness Ugbana", "C.J Amadi", "Total Calls", "Inbound Calls", "Outbound Calls", "Answered Calls", "Missed Calls", "Avg Talk Time", "Total Talk Time", "993", "80 calls/agent/day", "400 calls/agent"]) expect(html).toContain(text);
  });

  it("an agent's view carries only their own row", () => {
    const html = render([statRow("agent@winsalotcorp.com", "agent", 1)], "agent");
    expect(html).toContain("Henry Osuji");
    expect(html).not.toContain("Goodness Ugbana");
    expect(html).not.toContain("Import weekly Dialpad CSV");
    expect(html).toContain("Missed Calls");
  });
});
