import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CallListSegmentsClient from "@/components/crm-call-list/CallListSegmentsClient";
import { computeCallListProgress } from "@/lib/call-list-progress";
import type { CallListSegmentRow } from "@/lib/call-list-types";

const make = (n: number, name = `List ${n}`, agents: string[] = ["Henry Osuji"]) => ({
  segment: { id: `id${n}`, name, campaign_name: "c", territory: "Ottawa", source_file_name: `f${n}.csv`, total_uploaded_rows: 10, status: "active", created_at: "2026-09-01T00:00:00Z" } as unknown as CallListSegmentRow,
  serviceLabel: "Brent's Essentials — Pest Control",
  agentNames: agents,
  leadCount: 10,
  progress: computeCallListProgress(Array.from({ length: 10 }, (_, i) => ({ segment_id: `id${n}`, last_outcome: i < 4 ? "Voicemail" : null, last_contacted_at: i < 4 ? "2026-09-02T10:00:00Z" : null, callback_at: i === 0 ? "2026-10-01T10:00:00Z" : null }))),
});

describe("Call List Segments pagination (both CRMs)", () => {
  const rows = Array.from({ length: 60 }, (_, i) => make(i + 1));
  for (const [label, props] of [["Growth (compact, owner column)", { compact: true, fixedOwnerLabel: "Winsalot Corp" }], ["Lead Gen (compact)", { compact: true }]] as const) {
    it(`${label}: 25 rows by default with totals, page numbers, Previous/Next, 25/50/100`, () => {
      const html = renderToStaticMarkup(<CallListSegmentsClient basePath="/x" rows={rows} {...props} />);
      expect((html.match(/<tr /g) ?? []).length).toBe(25);
      expect(html).toContain("List 1<");
      expect(html).toContain("List 25<");
      expect(html).not.toContain("List 26<");
      expect(html).toContain("60");
      expect(html).toContain("Page 1 of 3");
      expect(html).toMatch(/Previous/);
      expect(html).toMatch(/Next/);
      for (const n of ["25", "50", "100"]) expect(html).toContain(`<option value="${n}"`);
      expect(html).toMatch(/aria-current="page"[^>]*>1</);
    });
  }
  it("Lead Gen compact keeps special rows and unassigned text, no side bar, no red", () => {
    const special = [make(1, "Auto Repair — Uncontactable (Admin Only)", []), make(2, "Snow Removal — Review Required — Admin Only"), make(3, "Pet Sitter — Ottawa — Admin Review / Uncontactable")];
    const html = renderToStaticMarkup(<CallListSegmentsClient basePath="/x" rows={special} compact />);
    for (const t of ["(Admin Only)", "Review Required — Admin Only", "Admin Review / Uncontactable", "Unassigned", "Henry Osuji", "f1.csv", "Brent&#x27;s Essentials — Pest Control", "40%", "In Progress"]) expect(html).toContain(t);
    expect(html).not.toContain("data-progress-side-bar");
    expect(html).not.toMatch(/red-|rose-|violet|purple/);
  });
  it("shows all records when total fits one page", () => {
    const html = renderToStaticMarkup(<CallListSegmentsClient basePath="/x" rows={rows.slice(0, 7)} compact />);
    expect(html).toContain("Page 1 of 1");
    expect((html.match(/<tr /g) ?? []).length).toBe(7);
  });
  it("Growth keeps its shipped column widths; only Lead Gen (longNames) gets the wider Segment column", () => {
    const growth = renderToStaticMarkup(<CallListSegmentsClient basePath="/x" rows={rows.slice(0, 2)} fixedOwnerLabel="Winsalot Corp" compact />);
    expect(growth).toContain("max-w-[170px]");
    expect(growth).toContain("min-w-[150px] max-w-[230px]");
    expect(growth).not.toContain("max-w-[270px]");
    const leadgen = renderToStaticMarkup(<CallListSegmentsClient basePath="/x" rows={rows.slice(0, 2)} compact longNames />);
    expect(leadgen).toContain("max-w-[270px]");
  });
});
