import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../site-url", () => ({ getSiteUrl: () => "https://growth.winsalotcorp.com" }));

import { formatCurrency, recentPaymentDisplayCurrency } from "../crm-clients-types";
import { renderReceiptEmail } from "../crm-receipt-email";
import type { ReceiptData } from "../crm-receipt";

const receipt: ReceiptData = {
  paymentId: "p1",
  receiptNumber: "RCT-2026-0001",
  businessName: "Hidebrandt Web Services",
  contactName: "Theodore",
  email: "a@b.c",
  amount: 250,
  currency: "CAD",
  amountLabel: "CA$250.00 CAD",
  paymentDate: "2026-09-29",
  description: "Initial Lead Generation Campaign Deposit",
  paymentTypeLabel: "Initial campaign deposit",
  paymentMethodLabel: "Interac e-Transfer",
  agreementNumber: "AGR-2026-0005",
  status: "PAID",
};

describe("receipt email branding", () => {
  it("always writes the business name as 'Winsalot Corp.' (with the period)", () => {
    const { subject, text, html } = renderReceiptEmail(receipt);
    for (const output of [subject, text, html]) {
      expect(output).toContain("Winsalot Corp.");
      expect(output).not.toMatch(/Winsalot Corp(?!\.)/);
    }
  });
});

describe("Recent Payments CAD display", () => {
  it("shows Hidebrandt's CAD payment as CA$250.00", () => {
    expect(formatCurrency(250, recentPaymentDisplayCurrency("CAD", "Hidebrandt Web Services"))).toBe("CA$250.00");
  });

  it("shows Brent's Essentials' USD-recorded payment as CA$750.00 (display only)", () => {
    expect(formatCurrency(750, recentPaymentDisplayCurrency("USD", "Brent's Essentials"))).toBe("CA$750.00");
    expect(formatCurrency(750, recentPaymentDisplayCurrency("USD", "Brent’s Essentials"))).toBe("CA$750.00");
  });

  it("never relabels any other client's USD payment", () => {
    expect(formatCurrency(100, recentPaymentDisplayCurrency("USD", "Some American Client"))).toBe("$100.00");
    expect(recentPaymentDisplayCurrency("USD", null)).toBe("USD");
  });
});
