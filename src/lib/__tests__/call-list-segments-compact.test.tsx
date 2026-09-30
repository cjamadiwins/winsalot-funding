import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CallListSegmentsClient from "@/components/crm-call-list/CallListSegmentsClient";
import { computeCallListProgress } from "@/lib/call-list-progress";
import type { CallListSegmentRow } from "@/lib/call-list-types";

const segment = { id: "x", name: "Website Designer – Barrie ON", campaign_name: "Winsalot Corp — Website Designer – Barrie ON", territory: "Barrie ON", source_file_name: "campaign-1.csv", total_uploaded_rows: 109, status: "active", created_at: "2026-09-01T00:00:00Z" } as unknown as CallListSegmentRow;
const leads = Array.from({ length: 109 }, (_, i) => ({
  segment_id: "x",
  last_outcome: i < 78 ? "No Answer" : null,
  last_contacted_at: i < 78 ? "2026-09-28T17:16:00Z" : null,
  callback_at: i < 2 ? "2026-10-01T10:00:00Z" : null,
}));
const rows = [{ segment, serviceLabel: "Winsalot Corp — Website Designer – Barrie ON", agentNames: ["Goodness Ugbana"], leadCount: 109, progress: computeCallListProgress(leads) }];

describe("Growth compact Call List Segments table", () => {
  const html = renderToStaticMarkup(<CallListSegmentsClient basePath="/admin/crm/call-list-segments" rows={rows} fixedOwnerLabel="Winsalot Corp" compact />);
  it("keeps every column and value", () => {
    for (const h of ["Segment", "Campaign / Service", "Client / Campaign Owner", "Territory", "Rows", "Assigned Agents", "Worked", "Remaining", "Follow-Ups", "Progress", "Status", "Last Worked", "List State", "Uploaded"]) expect(html).toContain(h);
    for (const v of ["Website Designer – Barrie ON", "campaign-1.csv", "Winsalot Corp", "Goodness Ugbana", "78 / 109", ">31<", "71%", "In Progress"]) expect(html).toContain(v);
    expect(html).toContain("tabular-nums");
  });
  it("has no row side bar and no red; colour only in status/progress", () => {
    expect(html).not.toContain("data-progress-side-bar");
    expect(html).not.toContain("absolute");
    expect(html).not.toMatch(/red-|rose-|violet|purple/);
    expect(html).toContain("bg-emerald-500");
    expect(html).toContain("text-emerald-700");
  });
  it("default (Lead Generation) layout still has the per-row side bar", () => {
    const lg = renderToStaticMarkup(<CallListSegmentsClient basePath="/leadgen/admin/call-list-segments" rows={rows} />);
    expect(lg).toContain('data-progress-side-bar="in_progress"');
  });
});
