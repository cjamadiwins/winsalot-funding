import { describe, expect, it } from "vitest";
import { formatCurrency, PAYROLL_CURRENCIES, PAYROLL_CURRENCY_LABELS } from "@/lib/payroll";

// Covers the per-agent Payroll Currency feature (migration 0134): every
// payroll figure is the same plain number regardless of currency - there
// is no FX conversion anywhere in this codebase - so the only thing that
// varies per currency is formatCurrency's own symbol/formatting.

describe("PAYROLL_CURRENCIES", () => {
  it("supports exactly the four currencies in the brief", () => {
    expect(PAYROLL_CURRENCIES).toEqual(["NGN", "PHP", "CAD", "USD"]);
  });

  it("has a human-readable label for every supported currency", () => {
    for (const currency of PAYROLL_CURRENCIES) {
      expect(PAYROLL_CURRENCY_LABELS[currency]).toContain(currency);
    }
  });
});

describe("formatCurrency", () => {
  it("formats NGN with the Naira symbol, matching formatNgn's existing behavior", () => {
    expect(formatCurrency(75_000, "NGN")).toBe("₦75,000");
  });

  it("formats PHP with the Peso symbol", () => {
    expect(formatCurrency(75_000, "PHP")).toBe("₱75,000");
  });

  it("formats CAD with a dollar sign", () => {
    expect(formatCurrency(75_000, "CAD")).toContain("75,000");
    expect(formatCurrency(75_000, "CAD")).toMatch(/\$/);
  });

  it("formats USD with a dollar sign", () => {
    expect(formatCurrency(75_000, "USD")).toBe("$75,000");
  });

  it("never shows a trailing .00 for whole amounts, but does show cents when present", () => {
    expect(formatCurrency(7_500, "NGN")).toBe("₦7,500");
    expect(formatCurrency(7_500.5, "NGN")).toBe("₦7,500.5");
  });

  it("produces the exact same number regardless of currency - no FX conversion", () => {
    const amount = 12_345.67;
    for (const currency of PAYROLL_CURRENCIES) {
      const digitsOnly = formatCurrency(amount, currency).replace(/[^\d.]/g, "");
      expect(digitsOnly).toBe("12345.67");
    }
  });
});
