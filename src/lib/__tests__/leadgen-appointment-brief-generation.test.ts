import { describe, expect, it } from "vitest";
import {
  BRIEF_LIMITS,
  buildBriefEmailBody,
  buildBriefEmailSubject,
  formatAppointmentWhen,
  generateClientBrief,
  personalizeGreeting,
  splitBriefEmailBody,
} from "../leadgen-appointment-prep";

// The Capital Painters (Hidebrandt Web Services) preparation fields.
const capital = {
  businessName: "Capital Painters",
  whyInterested:
    "Capital Painters is interested in improving its online presence so the business can generate more customer inquiries. The prospect wants stronger search-engine visibility through SEO and would also like the website rebranded so potential customers can clearly see the quality of its painting work.",
  primaryOpportunity: "Website Rebrand + SEO Lead Generation",
  mainInterest: "Website Redesign / SEO",
  primaryNeed: "Generate more leads from search while professionally showcasing completed painting projects.",
  recommendedObjective:
    "Discuss a website rebrand focused on project presentation, conversion and SEO, and identify the best strategy for improving search visibility and generating qualified customer inquiries.",
};

describe("generateClientBrief - Capital Painters", () => {
  const brief = generateClientBrief(capital);

  it("builds a professional summary entirely from the entered fields", () => {
    expect(brief.canGenerate).toBe(true);
    expect(brief.missing).toEqual([]);
    const [p1, p2, p3] = brief.summary.split("\n\n");
    expect(p1).toBe(capital.whyInterested);
    expect(p2).toBe("A key priority is to generate more leads from search while professionally showcasing completed painting projects.");
    expect(p3).toBe(`Recommended discussion for the appointment: ${capital.recommendedObjective}`);
  });

  it("fits the saved-summary limit and the field limits it relies on", () => {
    expect(brief.summary.length).toBeLessThanOrEqual(BRIEF_LIMITS.summary);
    expect(capital.whyInterested.length).toBeLessThanOrEqual(BRIEF_LIMITS.why);
    expect(capital.recommendedObjective.length).toBeLessThanOrEqual(BRIEF_LIMITS.objective);
    expect(capital.primaryNeed.length).toBeLessThanOrEqual(BRIEF_LIMITS.need);
  });
});

describe("generateClientBrief - never fabricates", () => {
  it("needs more information when nothing usable is entered, and says what", () => {
    const empty = generateClientBrief({ businessName: "Joe's Auto", whyInterested: "", primaryOpportunity: "", mainInterest: "", primaryNeed: "", recommendedObjective: "" });
    expect(empty.canGenerate).toBe(false);
    expect(empty.summary).toBe("");
    expect(empty.missing).toEqual(["Why This Prospect Is Interested", "Primary Opportunity", "Primary Need", "Recommended Objective"]);
  });

  it("only writes paragraphs whose source field exists, and lists the rest as missing", () => {
    const partial = generateClientBrief({ businessName: "Joe's Auto", whyInterested: "Wants more inquiries", primaryOpportunity: "SEO", mainInterest: null, primaryNeed: null, recommendedObjective: null });
    expect(partial.summary).toBe("Wants more inquiries.");
    expect(partial.missing).toEqual(["Primary Need", "Recommended Objective"]);
  });

  it("falls back to the main interest or opportunity, never to invented requirements", () => {
    expect(generateClientBrief({ businessName: "Joe's Auto", whyInterested: "", primaryOpportunity: "", mainInterest: "website redesign", primaryNeed: null, recommendedObjective: null }).summary).toBe("Joe's Auto is interested in website redesign.");
    expect(generateClientBrief({ businessName: "Joe's Auto", whyInterested: "", primaryOpportunity: "SEO", mainInterest: "", primaryNeed: null, recommendedObjective: null }).summary).toBe(
      "Joe's Auto has been identified as an opportunity for SEO.",
    );
  });

  it("phrases a need that is not an action as a stated need rather than rewording it", () => {
    const brief = generateClientBrief({ businessName: "X", whyInterested: "Interested.", primaryOpportunity: null, mainInterest: null, primaryNeed: "More customer leads", recommendedObjective: null });
    expect(brief.summary).toContain("Primary need identified: More customer leads.");
  });

  it("works for any client's prospect (nothing is Hidebrandt- or painter-specific)", () => {
    const brief = generateClientBrief({
      businessName: "Boondock Pet Resort",
      whyInterested: "Boondock Pet Resort wants an updated website.",
      primaryOpportunity: "Website redesign",
      mainInterest: "Website redesign",
      primaryNeed: "Increase online bookings",
      recommendedObjective: "Understand project scope",
    });
    expect(brief.summary).toBe(
      "Boondock Pet Resort wants an updated website.\n\nA key priority is to increase online bookings.\n\nRecommended discussion for the appointment: Understand project scope.",
    );
    expect(brief.summary).not.toMatch(/painting|SEO|Hidebrandt/i);
  });
});

describe("Appointment Brief email draft", () => {
  const generated = generateClientBrief(capital);
  const body = buildBriefEmailBody({
    recipientName: "Theodore",
    clientName: "Hidebrandt Web Services",
    businessName: "Capital Painters",
    industry: "Painting Company",
    appointmentDate: "2026-10-05",
    appointmentTime: "14:30:00",
    timezone: "America/Toronto",
    summary: generated.summary,
    primaryOpportunity: capital.primaryOpportunity,
    mainInterest: capital.mainInterest,
    primaryNeed: capital.primaryNeed,
    recommendedObjective: capital.recommendedObjective,
    portalUrl: "https://leads.winsalotcorp.com/client/appointments/6643cdcd-5c41-47ac-abbf-459d2421f781",
  });

  it("has the requested subject and structure", () => {
    expect(buildBriefEmailSubject("Capital Painters")).toBe("Appointment Brief – Capital Painters");
    expect(body.startsWith("Hi Theodore,\n\nHere is the preparation brief for your upcoming appointment with Capital Painters.")).toBe(true);
    expect(body).toContain("Key opportunity: Website Rebrand + SEO Lead Generation");
    expect(body).toContain("Main interest: Website Redesign / SEO");
    expect(body).toContain("Primary need: Generate more leads from search while professionally showcasing completed painting projects.");
    expect(body).toContain(`Recommended discussion: ${capital.recommendedObjective.replace(/\.$/, "")}`);
    expect(body.endsWith("Regards,\nWinsalot Corp.")).toBe(true);
  });

  it("includes the verified appointment details from the CRM", () => {
    expect(body).toContain("Prospect: Capital Painters");
    expect(body).toContain("Industry: Painting Company");
    expect(body).toContain("Date & time: Monday, October 5, 2026 at 2:30 PM (America/Toronto)");
  });

  it("does not repeat the recommended-discussion paragraph and leaks nothing internal or personal", () => {
    expect(body.match(/Recommended discussion/g)).toHaveLength(1);
    expect(body).not.toMatch(/INTERNAL|staff-only/i);
    expect(body).not.toMatch(/@/); // no prospect email address
    expect(body).not.toMatch(/\d{3}[ -]?\d{3}[ -]?\d{4}/); // no prospect phone number
  });

  it("greets by the client contact's name, or the client team when there is none", () => {
    expect(personalizeGreeting(body, "Praveen", "X").startsWith("Hi Praveen,")).toBe(true);
    expect(personalizeGreeting(body, null, "Hidebrandt Web Services").startsWith("Hi Hidebrandt Web Services team,")).toBe(true);
    expect(personalizeGreeting("No greeting here", "Pat", "X")).toBe("No greeting here");
  });

  it("splits around the portal link for a button, and degrades gracefully if Admin removes it", () => {
    const parts = splitBriefEmailBody(body)!;
    expect(parts.url).toBe("https://leads.winsalotcorp.com/client/appointments/6643cdcd-5c41-47ac-abbf-459d2421f781");
    expect(parts.before).toContain("Appointment details:");
    expect(parts.after).toBe("Regards,\nWinsalot Corp.");
    expect(splitBriefEmailBody("Hi there,\n\nJust text.")).toBeNull();
  });

  it("formats the appointment time without any timezone drift", () => {
    expect(formatAppointmentWhen("2026-10-05", "09:05:00", "America/Toronto")).toBe("Monday, October 5, 2026 at 9:05 AM (America/Toronto)");
    expect(formatAppointmentWhen("2026-12-31", "00:00:00", "America/Winnipeg")).toBe("Thursday, December 31, 2026 at 12:00 AM (America/Winnipeg)");
    expect(formatAppointmentWhen("bad", "x", "UTC")).toBe("bad x (UTC)");
  });
});
