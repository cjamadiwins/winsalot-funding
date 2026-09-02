import { describe, expect, it } from "vitest";
import { buildMarketingEmail, firstNameForMarketing } from "../crm-marketing-email";

describe("Growth CRM marketing email", () => {
  it("personalizes the service template and includes a visible unsubscribe link", () => {
    const result = buildMarketingEmail({
      subjectTemplate: "Support for {{business_name}}",
      bodyTemplate: "Hi {{first_name}},\n\nWe can help {{business_name}}.",
      firstName: "Ada",
      businessName: "North Star Inc.",
      ctaLabel: "Schedule a call",
      bookingUrl: "https://growth.winsalotcorp.com/book-consultation?t=abc",
      unsubscribeUrl: "https://growth.winsalotcorp.com/unsubscribe/token",
    });

    expect(result.subject).toBe("Support for North Star Inc.");
    expect(result.text).toContain("Hi Ada");
    expect(result.text).toContain("Unsubscribe:");
    expect(result.html).toContain("Unsubscribe from marketing emails");
    expect(result.html).toContain(result.subject);
  });

  it("always shows the current head-office address, never the retired one", () => {
    const result = buildMarketingEmail({
      subjectTemplate: "Support for {{business_name}}",
      bodyTemplate: "Hi {{first_name}},\n\nWe can help {{business_name}}.",
      firstName: "Ada",
      businessName: "North Star Inc.",
      ctaLabel: "Schedule a call",
      bookingUrl: "https://growth.winsalotcorp.com/book-consultation?t=abc",
      unsubscribeUrl: "https://growth.winsalotcorp.com/unsubscribe/token",
    });

    for (const output of [result.text, result.html]) {
      expect(output).toContain("55 Rutherford Road South, Suite 3");
      expect(output).toContain("Brampton, Ontario L6W 3J3, Canada");
      expect(output).not.toContain("Leacrest");
    }
  });

  it("includes the Winsalot Corp. logo, a strong-blue header, and a prominent CTA button", () => {
    const result = buildMarketingEmail({
      subjectTemplate: "Support for {{business_name}}",
      bodyTemplate: "Hi {{first_name}},\n\nWe can help {{business_name}}.",
      firstName: "Ada",
      businessName: "North Star Inc.",
      ctaLabel: "Discuss lead generation",
      bookingUrl: "https://growth.winsalotcorp.com/book-consultation?t=abc",
      unsubscribeUrl: "https://growth.winsalotcorp.com/unsubscribe/token",
    });

    expect(result.html).toContain("winsalot-logo.png");
    expect(result.html).toContain("#075985");
    expect(result.html).toContain("Discuss lead generation");
    expect(result.html).toContain('max-width:600px');
  });

  it("uses a neutral greeting when no contact name is known", () => {
    expect(firstNameForMarketing(null)).toBe("there");
    expect(firstNameForMarketing("  C.J. Amadi ")).toBe("C.J.");
  });
});
