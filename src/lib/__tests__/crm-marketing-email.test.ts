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
      mailingAddress: "123 Main Street, Brampton, ON",
    });

    expect(result.subject).toBe("Support for North Star Inc.");
    expect(result.text).toContain("Hi Ada");
    expect(result.text).toContain("Unsubscribe:");
    expect(result.html).toContain("Unsubscribe from marketing emails");
    expect(result.html).toContain("123 Main Street, Brampton, ON");
  });

  it("uses a neutral greeting when no contact name is known", () => {
    expect(firstNameForMarketing(null)).toBe("there");
    expect(firstNameForMarketing("  C.J. Amadi ")).toBe("C.J.");
  });
});
