import { describe, expect, it } from "vitest";
import {
  calculateSubcontractorGrossPay,
  calculateSubcontractorNetPay,
  formatSubcontractorCurrency,
  isQuantityBasedPayType,
  SUBCONTRACTOR_CURRENCIES,
  sumSubcontractorPaymentsByCurrency,
  type SubcontractorPaymentRow,
  type SubcontractorRow,
} from "@/lib/subcontractor-payroll";

// Covers the pure calculation logic behind the Subcontractors feature
// (supabase/migrations/0135_subcontractor_payroll.sql): Quantity x Rate =
// Gross Pay for quantity-based pay types, Net Pay = Gross + Adjustments -
// Deductions, and per-currency aggregation with no FX conversion.

describe("SUBCONTRACTOR_CURRENCIES", () => {
  it("supports all 6 currencies from the brief, a superset of the 4 agent Payroll Currencies", () => {
    expect(SUBCONTRACTOR_CURRENCIES).toEqual(["NGN", "PHP", "CAD", "USD", "GBP", "EUR"]);
  });
});

describe("isQuantityBasedPayType", () => {
  it("is true only for hourly, daily, and per_lead_appointment", () => {
    expect(isQuantityBasedPayType("hourly")).toBe(true);
    expect(isQuantityBasedPayType("daily")).toBe(true);
    expect(isQuantityBasedPayType("per_lead_appointment")).toBe(true);
    expect(isQuantityBasedPayType("fixed")).toBe(false);
    expect(isQuantityBasedPayType("weekly")).toBe(false);
    expect(isQuantityBasedPayType("biweekly")).toBe(false);
    expect(isQuantityBasedPayType("monthly")).toBe(false);
  });
});

describe("calculateSubcontractorGrossPay", () => {
  it("computes Quantity x Rate for an hourly subcontractor", () => {
    expect(calculateSubcontractorGrossPay("hourly", 40, 25)).toBe(1000);
  });

  it("computes Quantity x Rate for a daily subcontractor", () => {
    expect(calculateSubcontractorGrossPay("daily", 10, 150)).toBe(1500);
  });

  it("computes Quantity x Rate for a per-lead/appointment subcontractor", () => {
    expect(calculateSubcontractorGrossPay("per_lead_appointment", 12, 50)).toBe(600);
  });

  it("returns 0 for flat pay types regardless of quantity - they don't use this function's result", () => {
    expect(calculateSubcontractorGrossPay("fixed", 40, 25)).toBe(0);
    expect(calculateSubcontractorGrossPay("monthly", 1, 3000)).toBe(0);
  });

  it("never returns a negative amount for a bad/missing quantity", () => {
    expect(calculateSubcontractorGrossPay("hourly", null, 25)).toBe(0);
    expect(calculateSubcontractorGrossPay("hourly", -5, 25)).toBe(0);
  });
});

describe("calculateSubcontractorNetPay", () => {
  it("adds adjustments and subtracts deductions from gross pay", () => {
    expect(calculateSubcontractorNetPay({ grossPay: 1000, adjustments: 100, deductions: 50 })).toBe(1050);
  });

  it("can go to exactly 0 when deductions equal gross plus adjustments", () => {
    expect(calculateSubcontractorNetPay({ grossPay: 500, adjustments: 0, deductions: 500 })).toBe(0);
  });
});

describe("formatSubcontractorCurrency", () => {
  it("formats each of the 6 currencies with the correct symbol", () => {
    expect(formatSubcontractorCurrency(1000, "NGN")).toBe("₦1,000");
    expect(formatSubcontractorCurrency(1000, "PHP")).toBe("₱1,000");
    expect(formatSubcontractorCurrency(1000, "USD")).toBe("$1,000");
    expect(formatSubcontractorCurrency(1000, "GBP")).toBe("£1,000");
  });

  it("never converts the underlying number across currencies", () => {
    // Locale-specific separators differ (e.g. EUR's de-DE uses "." for
    // thousands and "," for decimals) - strip every non-digit character
    // so only the digit sequence itself is compared, regardless of which
    // characters represent the thousands/decimal separators.
    for (const currency of SUBCONTRACTOR_CURRENCIES) {
      const digitsOnly = formatSubcontractorCurrency(12345.67, currency).replace(/\D/g, "");
      expect(digitsOnly).toBe("1234567");
    }
  });
});

describe("sumSubcontractorPaymentsByCurrency", () => {
  function makeSubcontractor(overrides: Partial<SubcontractorRow> = {}): SubcontractorRow {
    return {
      id: "sub-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      full_name: "Test Sub",
      business_client_id: null,
      country: null,
      currency: "NGN",
      pay_type: "fixed",
      pay_rate: 0,
      notes: null,
      active: true,
      deactivated_at: null,
      ...overrides,
    };
  }

  function makePayment(overrides: Partial<SubcontractorPaymentRow> = {}): SubcontractorPaymentRow {
    return {
      id: "pay-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      subcontractor_id: "sub-1",
      period_start: "2026-01-01",
      period_end: "2026-01-14",
      quantity: null,
      gross_pay: 1000,
      adjustments: 0,
      deductions: 0,
      net_pay: 1000,
      status: "pending",
      payment_date: null,
      notes: null,
      ...overrides,
    };
  }

  it("sums each subcontractor's payments under their own currency, never blending currencies", () => {
    const ngnSub = makeSubcontractor({ id: "ngn-sub", currency: "NGN" });
    const phpSub = makeSubcontractor({ id: "php-sub", currency: "PHP" });
    const subcontractorsById = new Map([
      [ngnSub.id, ngnSub],
      [phpSub.id, phpSub],
    ]);
    const payments = [
      makePayment({ id: "p1", subcontractor_id: "ngn-sub", net_pay: 1000 }),
      makePayment({ id: "p2", subcontractor_id: "ngn-sub", net_pay: 500 }),
      makePayment({ id: "p3", subcontractor_id: "php-sub", net_pay: 2000 }),
    ];

    const totals = sumSubcontractorPaymentsByCurrency(payments, subcontractorsById);
    expect(totals).toEqual({ NGN: 1500, PHP: 2000 });
  });

  it("skips a payment whose subcontractor can't be found", () => {
    const totals = sumSubcontractorPaymentsByCurrency([makePayment({ subcontractor_id: "missing" })], new Map());
    expect(totals).toEqual({});
  });
});
