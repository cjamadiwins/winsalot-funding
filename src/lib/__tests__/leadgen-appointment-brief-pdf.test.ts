import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { renderAppointmentBriefPdf } from "@/lib/leadgen-appointment-brief-pdf";
import { BRIEF_TEMPLATE_WEBSITE_HSO, buildWebsiteHsoTemplate } from "@/lib/leadgen-appointment-brief-template";
import { parseLineList, type AppointmentBriefRow } from "@/lib/leadgen-appointment-prep";

describe("renderAppointmentBriefPdf", () => {
  it("renders a non-empty PDF for the Website + HSO brief", async () => {
    const t = buildWebsiteHsoTemplate({ businessName: "Hiveforge Construction Ltd", contactName: "Hassan" });
    const brief = {
      ...t,
      id: "b", appointment_id: "a", client_id: "c", interest_level: "High", appointment_summary: t.why_interested,
      talking_points: parseLineList(t.talking_points, 5), suggested_questions: parseLineList(t.suggested_questions, 6),
      prep_status: "brief_ready", prepared_by: null, sent_at: null, sent_by: null, viewed_at: null, created_at: "", updated_at: "",
      brief_template: BRIEF_TEMPLATE_WEBSITE_HSO,
    } as AppointmentBriefRow;
    const pdf = await renderAppointmentBriefPdf({
      clientName: "Hidebrandt Web Services", businessName: "Hiveforge Construction Ltd", contactName: "Hassan", phone: null, email: null,
      website: null, industry: "Construction", appointmentDate: "2026-11-03", appointmentTime: "15:00:00", timezone: "America/Toronto",
      meetingType: "Phone Call", agentName: "Goodness Ugbana", brief,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
