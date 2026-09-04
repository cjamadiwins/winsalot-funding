import { describe, expect, it } from "vitest";
import { calculateFinalPay, formatAmountInputDisplay, sanitizeAmountInput } from "@/lib/payroll";

// Covers the Incentive / Bonus Earned input on the payroll form
// (src/components/payroll/AdminPayrollClient.tsx): typing into a field
// that still holds its "0" default must never leave a literal "010000"
// behind, the display value must be comma-grouped (e.g. "₦10,000"'s
// "10,000"), and the underlying value that's actually calculated with and
// submitted must stay a clean, parseable number throughout.

describe("sanitizeAmountInput", () => {
  it("strips a leading zero left over from the field's default value", () => {
    expect(sanitizeAmountInput("010000")).toBe("10000");
  });

  it("keeps a single 0 as 0", () => {
    expect(sanitizeAmountInput("0")).toBe("0");
  });

  it("strips non-digit characters, including commas typed or pasted in", () => {
    expect(sanitizeAmountInput("10,000")).toBe("10000");
    expect(sanitizeAmountInput("₦10,000")).toBe("10000");
  });

  it("preserves a single decimal point and its digits, including a leading 0.", () => {
    expect(sanitizeAmountInput("0.5")).toBe("0.5");
    expect(sanitizeAmountInput("10000.50")).toBe("10000.50");
  });

  it("collapses multiple decimal points to just the first one", () => {
    expect(sanitizeAmountInput("10.00.5")).toBe("10.005");
  });

  it("returns an empty string for an emptied field", () => {
    expect(sanitizeAmountInput("")).toBe("");
  });
});

describe("formatAmountInputDisplay", () => {
  it("comma-groups a whole number amount (the ₦10,000 case)", () => {
    expect(formatAmountInputDisplay("10000")).toBe("10,000");
  });

  it("keeps a bare 0 as 0, not blank", () => {
    expect(formatAmountInputDisplay("0")).toBe("0");
  });

  it("keeps decimal digits as typed rather than rounding them", () => {
    expect(formatAmountInputDisplay("10000.5")).toBe("10,000.5");
    expect(formatAmountInputDisplay("0.")).toBe("0.");
  });

  it("passes an empty string through unchanged so the field can be cleared", () => {
    expect(formatAmountInputDisplay("")).toBe("");
  });
});

describe("Incentive/Bonus feeding into Final Amount Payable", () => {
  it("adds a ₦10,000 incentive straight through into the final payable amount", () => {
    const sanitized = sanitizeAmountInput("010000"); // what the field would have held before this fix
    expect(sanitized).toBe("10000");

    const finalPay = calculateFinalPay({
      basePayEarned: 150000,
      internetAllowance: 5000,
      incentiveBonus: Number(sanitized) || 0,
      otherAdditions: 0,
      holidayPay: 0,
      deductions: 0,
    });

    expect(finalPay).toBe(165000);
  });

  it("leaves every other payroll input untouched - only the incentive figure changes the total", () => {
    const withoutIncentive = calculateFinalPay({
      basePayEarned: 150000,
      internetAllowance: 5000,
      incentiveBonus: 0,
      otherAdditions: 2000,
      holidayPay: 7500,
      deductions: 1000,
    });
    const withIncentive = calculateFinalPay({
      basePayEarned: 150000,
      internetAllowance: 5000,
      incentiveBonus: Number(sanitizeAmountInput("10000")),
      otherAdditions: 2000,
      holidayPay: 7500,
      deductions: 1000,
    });

    expect(withIncentive - withoutIncentive).toBe(10000);
  });
});
