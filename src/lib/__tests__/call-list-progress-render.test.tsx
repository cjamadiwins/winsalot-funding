import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CallListCardFrame, CallListProgressSummary } from "@/components/crm-call-list/CallListProgressInfo";
import CallListSegmentsClient from "@/components/crm-call-list/CallListSegmentsClient";
import { computeCallListProgress } from "@/lib/call-list-progress";
import type { CallListSegmentRow } from "@/lib/call-list-types";

const leads = (total: number, worked: number, callbacks = 0) =>
  Array.from({ length: total }, (_, i) => ({
    segment_id: "s",
    last_outcome: i < worked ? "No Answer" : null,
    last_contacted_at: i < worked ? "2026-09-01T10:00:00Z" : null,
    callback_at: i < callbacks ? "2026-10-01T10:00:00Z" : null,
  }));

describe("call list progress rendering", () => {
  it("agent card shows summary text, a green side bar for In Progress, and no red", () => {
    const progress = computeCallListProgress(leads(95, 63, 8));
    const html = renderToStaticMarkup(
      <CallListCardFrame status={progress.status}>
        <CallListProgressSummary progress={progress} listStatus="active" />
      </CallListCardFrame>
    );
    expect(html).toContain("63 / 95 worked");
    expect(html).toContain("66%");
    expect(html).toContain("32 remaining");
    expect(html).toContain("Follow-ups / Callbacks");
    expect(html).toContain(">8</strong>");
    expect(html).toContain("Interested");
    expect(html).toContain("Appointments");
    expect(html).toContain("List: Active");
    expect(html).toContain('aria-label="Call list completion"');
    expect(html).toContain("In Progress");
    expect(html).toMatch(/data-progress-side-bar="in_progress"[^>]*/);
    expect(html).toContain("w-[5px]");
    expect(html).toContain("rounded-full");
    expect(html).toContain("bg-emerald-500");
    expect(html).not.toMatch(/red-|rose-/);
  });

  it("admin table has the progress columns and a left-edge accent on each row", () => {
    const segment = { id: "x", name: "List", campaign_name: "C", territory: null, source_file_name: null, total_uploaded_rows: 10, status: "active", created_at: "2026-09-01T00:00:00Z" } as unknown as CallListSegmentRow;
    const html = renderToStaticMarkup(
      <CallListSegmentsClient
        basePath="/admin/crm/call-list-segments"
        fixedOwnerLabel="Winsalot Corp"
        rows={[{ segment, serviceLabel: "C", agentNames: ["Henry Osuji"], leadCount: 10, progress: computeCallListProgress(leads(10, 10)) }]}
      />
    );
    for (const h of ["Worked", "Remaining", "Follow-Ups", "Progress", "Status", "Last Worked", "Assigned Agents", "Client / Campaign Owner"]) expect(html).toContain(h);
    expect(html).toContain('data-progress-side-bar="completed"');
    expect(html).toContain("bg-blue-500");
    expect(html).toContain("absolute bottom-2 left-2 top-2");
    expect(html).not.toContain("border-l-");
    expect(html).toContain("Completed");
    expect(html).not.toMatch(/red-|rose-/);
  });
});
