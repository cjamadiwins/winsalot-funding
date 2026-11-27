import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { renderAppointmentBriefPdf } from "@/lib/leadgen-appointment-brief-pdf";
import {
  BRIEF_PREPARED_BY,
  BRIEF_PREPARED_BY_TEKNOKRAFT,
  BRIEF_TEMPLATE_TEKNOKRAFT_GOOGLE,
  BRIEF_TEMPLATE_WEBSITE_HSO,
  briefPreparedBy,
  buildTeknokraftGoogleTemplate,
  buildWebsiteHsoTemplate,
} from "@/lib/leadgen-appointment-brief-template";
import { MAX_SUGGESTED_QUESTIONS, MAX_TALKING_POINTS, BRIEF_LIMITS, isBriefContentComplete, parseLineList, type AppointmentBriefRow } from "@/lib/leadgen-appointment-prep";

describe("Teknokraft Google Visibility + Local SEO brief template", () => {
  const t = buildTeknokraftGoogleTemplate({ businessName: "Unique Star Plumbing and Heating Ltd", contactName: "Abdul", industry: "Plumbing and Heating", serviceArea: "Calgary and surrounding areas" });

  it("is send-ready and within field limits", () => {
    const talking = parseLineList(t.talking_points, 50);
    const questions = parseLineList(t.suggested_questions, 50);
    expect(talking.length).toBeLessThanOrEqual(MAX_TALKING_POINTS);
    expect(questions.length).toBeLessThanOrEqual(MAX_SUGGESTED_QUESTIONS);
    expect(isBriefContentComplete({ why_interested: t.why_interested, primary_opportunity: t.primary_opportunity, talking_points: talking, suggested_questions: questions })).toBe(true);
    expect(t.why_interested.length).toBeLessThanOrEqual(BRIEF_LIMITS.why);
    expect(t.primary_need.length).toBeLessThanOrEqual(BRIEF_LIMITS.need);
    expect(t.recommended_objective.length).toBeLessThanOrEqual(BRIEF_LIMITS.objective);
    expect(t.main_interest.length).toBeLessThanOrEqual(BRIEF_LIMITS.interest);
    for (const line of [...talking, ...questions]) expect(line.length).toBeLessThanOrEqual(240);
  });

  it("emphasizes Google visibility, Maps, Business Profile, local SEO, inquiries and bookings", () => {
    const all = Object.values(t).join("\n");
    for (const phrase of ["Google Search", "Google Maps", "Google Business Profile", "Local SEO", "inquiries", "service bookings", "existing website", "digital marketing"]) {
      expect(all.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(t.why_interested).toContain("Abdul");
    expect(t.why_interested).toContain("Calgary and surrounding areas");
  });

  it("is reusable: generic wording when industry and area are unknown", () => {
    const g = buildTeknokraftGoogleTemplate({ businessName: "Acme Co", contactName: null });
    expect(g.why_interested).toContain("the owner");
    expect(g.why_interested).not.toMatch(/undefined|null/);
    expect(g.primary_need).not.toMatch(/undefined|null/);
  });

  it("makes no pricing, ranking or volume promises", () => {
    expect(Object.values(t).join("\n")).not.toMatch(/\$|guarantee|#1|first page/i);
  });

  it("uses Teknokraft branding only for its own template; Hidebrandt branding is unchanged", () => {
    expect(briefPreparedBy(BRIEF_TEMPLATE_TEKNOKRAFT_GOOGLE)).toBe(BRIEF_PREPARED_BY_TEKNOKRAFT);
    expect(BRIEF_PREPARED_BY_TEKNOKRAFT).toBe("Prepared by Winsalot Corp. for Teknokraft Canada Inc.");
    expect(briefPreparedBy(BRIEF_TEMPLATE_WEBSITE_HSO)).toBe(BRIEF_PREPARED_BY);
    expect(briefPreparedBy(null)).toBe(BRIEF_PREPARED_BY);
    expect(BRIEF_PREPARED_BY).toBe("Prepared by Winsalot Corp. for Hidebrandt Web Services");
  });

  it("leaves the Hidebrandt template output untouched", () => {
    const h = buildWebsiteHsoTemplate({ businessName: "Hiveforge Construction Ltd", contactName: "Hassan" });
    expect(h.main_interest).toBe("Website Redesign / Human Search Optimization (HSO)");
    expect(h.primary_opportunity).toBe("Website redesign + Human Search Optimization");
    expect(h.recommended_next_step).toBe("Send Proposal");
    expect(Object.values(h).join("\n")).not.toMatch(/Google Business Profile/);
  });

  it("generates a client summary and renders a PDF showing the Calgary appointment", async () => {
    const talking = parseLineList(t.talking_points, MAX_TALKING_POINTS);
    const questions = parseLineList(t.suggested_questions, MAX_SUGGESTED_QUESTIONS);
    const brief = {
      ...t, id: "b", appointment_id: "a", client_id: "c", appointment_summary: t.why_interested, talking_points: talking, suggested_questions: questions,
      prep_status: "brief_ready", prepared_by: null, sent_at: null, sent_by: null, viewed_at: null, created_at: "", updated_at: "",
      brief_template: BRIEF_TEMPLATE_TEKNOKRAFT_GOOGLE,
    } as unknown as AppointmentBriefRow;
    const pdf = await renderAppointmentBriefPdf({
      clientName: "Teknokraft Canada Inc.", businessName: "Unique Star Plumbing and Heating Ltd", contactName: "Abdul", phone: "+1 (587) 700-6765",
      email: "info@uniquestarplumbing.ca", website: "uniquestarplumbing.ca", industry: "Plumbing and Heating", appointmentDate: "2026-11-30",
      appointmentTime: "16:00:00", timezone: "America/Edmonton", meetingType: "Phone Call", agentName: "Goodness Ugbana", brief,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
