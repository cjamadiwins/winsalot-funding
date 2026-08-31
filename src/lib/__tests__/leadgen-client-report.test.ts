import { describe, expect, it } from "vitest";
import { leadgenClientReportCsv, resolveLeadgenReportMonth, type LeadgenClientReport } from "../leadgen-client-report";

describe("monthly client reports", () => {
  it("resolves a selected month to the full calendar month", () => {
    expect(resolveLeadgenReportMonth("2026-02")).toEqual({
      month: "2026-02",
      period: { from: "2026-02-01", to: "2026-02-28" },
    });
    expect(resolveLeadgenReportMonth("2028-02").period.to).toBe("2028-02-29");
  });

  it("exports client outcomes without internal activity metrics", () => {
    const report = {
      client: { name: "Brent's Essentials" },
      period: { from: "2026-08-01", to: "2026-08-31" },
      leadsAdded: 12,
      interestedLeads: 5,
      appointmentsBooked: 3,
      appointments: [],
    } as unknown as LeadgenClientReport;
    const csv = leadgenClientReportCsv(report);
    expect(csv).toContain("Leads Generated");
    expect(csv).toContain("Interested / Qualified Leads");
    expect(csv).toContain("Appointments Booked");
    expect(csv).not.toMatch(/Calls Made|Emails Sent|Follow-Ups|Follow-ups Completed/i);
  });
});
