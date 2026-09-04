import { describe, expect, it } from "vitest";
import { formatCompensationArrangement, renderSubcontractorAgreementTemplate } from "@/lib/crm-subcontractor-agreement";

// Covers {{token}} substitution for the Independent Contractor Agreement
// (supabase/migrations/0137's seeded version 1.0 template) against the
// brief's three mock subcontractors, and the compensation-arrangement text
// that fills the Agreement's "Currency / Rate or Amount" blanks.

describe("formatCompensationArrangement", () => {
  it("formats a per-appointment rate in Naira (Test 1: Nigeria/NGN/Per Appointment)", () => {
    const text = formatCompensationArrangement({ payType: "per_lead_appointment", payRate: 5000, currency: "NGN" });
    expect(text).toContain("Per Lead / Appointment");
    expect(text).toMatch(/₦5,000/);
  });

  it("formats an hourly rate in Philippine Pesos (Test 2: Philippines/PHP/Hourly)", () => {
    const text = formatCompensationArrangement({ payType: "hourly", payRate: 350, currency: "PHP" });
    expect(text).toContain("Hourly");
  });

  it("formats a fixed amount in Canadian Dollars (Test 3: Canada/CAD/Fixed Project)", () => {
    const text = formatCompensationArrangement({ payType: "fixed", payRate: 2500, currency: "CAD" });
    expect(text).toContain("Fixed Amount");
  });
});

describe("renderSubcontractorAgreementTemplate", () => {
  const template = {
    content: [
      { key: "s4_compensation", title: "4. Compensation", body: "Currency: {{currency}}\nRate or Amount: {{rate_amount}}" },
      { key: "s19_term", title: "19. Term", body: "Start Date: {{start_date}}" },
      { key: "s1_services", title: "1. Services", body: "No tokens here." },
    ],
  };

  it("substitutes currency, rate_amount, and start_date for every section that references them", () => {
    const rendered = renderSubcontractorAgreementTemplate(template, {
      currency: "PHP",
      payType: "hourly",
      payRate: 350,
      startDate: "2026-09-15",
    });

    expect(rendered.find((s) => s.key === "s4_compensation")?.body).toContain("Currency: PHP");
    expect(rendered.find((s) => s.key === "s4_compensation")?.body).toContain("Hourly");
    expect(rendered.find((s) => s.key === "s19_term")?.body).toBe("Start Date: 2026-09-15");
  });

  it("falls back to 'Not yet set' when the subcontractor has no start date yet", () => {
    const rendered = renderSubcontractorAgreementTemplate(template, {
      currency: "USD",
      payType: "fixed",
      payRate: 100,
      startDate: null,
    });
    expect(rendered.find((s) => s.key === "s19_term")?.body).toBe("Start Date: Not yet set");
  });

  it("leaves sections with no tokens untouched", () => {
    const rendered = renderSubcontractorAgreementTemplate(template, { currency: "CAD", payType: "fixed", payRate: 1, startDate: null });
    expect(rendered.find((s) => s.key === "s1_services")?.body).toBe("No tokens here.");
  });
});
