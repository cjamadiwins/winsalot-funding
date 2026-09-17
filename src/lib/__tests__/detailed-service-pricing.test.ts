import { describe, expect, it } from "vitest";
import {
  buildDetailedServicePricingHtml,
  buildDetailedServicePricingText,
  formatLeadGenerationPrice,
  getDetailedServicePricingTemplate,
} from "../detailed-service-pricing";

const pricing = { priceCents: 75_000, billingPeriod: "month" as const };
const common = {
  contactName: "Jamie Smith",
  businessName: "Maestro Tech",
  leadGenerationPricing: pricing,
};

describe("Detailed Service & Pricing templates", () => {
  it("uses the configured Lead Generation price and personalized details", () => {
    const template = getDetailedServicePricingTemplate({ ...common, service: "lead_generation" });
    expect(formatLeadGenerationPrice(pricing)).toBe("$750/month");
    expect(template.subject).toBe("Winsalot Corp Lead Generation — Service & Pricing Information");
    expect(template.priceSent).toBe("$750/month");
    expect(template.paragraphs.join("\n")).toContain("Hi Jamie,");
    expect(template.paragraphs.join("\n")).toContain("Maestro Tech");
    expect(template.paragraphs.join("\n")).toContain("$750/month");
  });

  it("does not invent a fixed Business Finance price", () => {
    const template = getDetailedServicePricingTemplate({ ...common, service: "business_financing" });
    expect(template.priceSent).toBeNull();
    expect(template.paragraphs.join("\n")).not.toContain("$750");
    expect(template.paragraphs.join("\n")).toContain("depend on the business profile, lender, approval");
  });

  it("renders the branded CTA without a visible raw URL", () => {
    const continueUrl = "https://growth.winsalotcorp.com/continue-with-winsalot";
    const input = { ...common, service: "lead_generation" as const, continueUrl };
    expect(buildDetailedServicePricingText(input)).not.toContain(continueUrl);
    const html = buildDetailedServicePricingHtml(input);
    expect(html).toContain(`href="${continueUrl}"`);
    expect(html).toContain(">Continue with Winsalot Corp</a>");
    expect(html).not.toContain("If the button does not work, copy this link:");
    expect(html).not.toContain(`>${continueUrl}<`);
  });
});
