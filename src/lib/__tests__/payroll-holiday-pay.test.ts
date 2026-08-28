import { describe, expect, it } from "vitest";
import { buildPayrollAdjustmentAuditRows, calculateFinalPay, type PayrollAdjustableFields } from "@/lib/payroll";

// Covers the Holiday Pay integration into src/lib/payroll.ts (migration
// 0106): holiday_pay as its own payroll line item, folded into the final
// total exactly like every other addition, and tracked by its own audit
// action so "Holiday pay changed" is distinguishable from "Other addition
// changed" in the audit history.

function baseFields(overrides: Partial<PayrollAdjustableFields> = {}): PayrollAdjustableFields {
  return {
    days_present: 10,
    approved_paid_days: 0,
    unpaid_absence_days: 0,
    total_payable_days: 10,
    regular_paid_hours: 75,
    unpaid_hours: 0,
    approved_paid_leave_hours: 0,
    bonus_commission: 0,
    other_additions: 0,
    holiday_pay: 0,
    internet_allowance: 25_000,
    deductions: 0,
    admin_notes: null,
    ...overrides,
  };
}

describe("calculateFinalPay with holidayPay", () => {
  it("adds holidayPay into the total exactly like other additions", () => {
    const withoutHoliday = calculateFinalPay({
      basePayEarned: 50_000,
      internetAllowance: 25_000,
      incentiveBonus: 0,
      otherAdditions: 0,
      deductions: 0,
    });
    const withHoliday = calculateFinalPay({
      basePayEarned: 50_000,
      internetAllowance: 25_000,
      incentiveBonus: 0,
      otherAdditions: 0,
      deductions: 0,
      holidayPay: 7_500,
    });
    expect(withHoliday - withoutHoliday).toBe(7_500);
  });

  it("defaults holidayPay to 0 for callers that predate the Holiday Pay feature", () => {
    const total = calculateFinalPay({
      basePayEarned: 50_000,
      internetAllowance: 25_000,
      incentiveBonus: 1_000,
      otherAdditions: 500,
      deductions: 200,
    });
    expect(total).toBe(50_000 + 25_000 + 1_000 + 500 - 200);
  });
});

describe("buildPayrollAdjustmentAuditRows: holiday_pay_changed", () => {
  it("emits a holiday_pay_changed row when only holiday_pay changes", () => {
    const before = baseFields({ holiday_pay: 0 });
    const after = baseFields({ holiday_pay: 7_500 });
    const rows = buildPayrollAdjustmentAuditRows(before, after);
    expect(rows).toEqual([{ action: "holiday_pay_changed", details: { from: 0, to: 7_500 } }]);
  });

  it("does not emit holiday_pay_changed when holiday_pay is unchanged", () => {
    const before = baseFields({ holiday_pay: 7_500, other_additions: 0 });
    const after = baseFields({ holiday_pay: 7_500, other_additions: 1_000 });
    const rows = buildPayrollAdjustmentAuditRows(before, after);
    expect(rows.some((r) => r.action === "holiday_pay_changed")).toBe(false);
    expect(rows.some((r) => r.action === "addition_changed")).toBe(true);
  });

  it("emits both addition_changed and holiday_pay_changed when both change in the same save", () => {
    const before = baseFields({ holiday_pay: 0, other_additions: 0 });
    const after = baseFields({ holiday_pay: 3_000, other_additions: 500 });
    const rows = buildPayrollAdjustmentAuditRows(before, after);
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("holiday_pay_changed");
    expect(actions).toContain("addition_changed");
  });
});
