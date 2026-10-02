import { expect, it } from "vitest";
import { AGENT_PAYROLL_COLUMNS, isReopened, summarizePayroll } from "../shared-payroll";
import type { PayrollRecord } from "../payroll";
import { buildPayStatementHtml, type PayStatementInput } from "../pay-statement";

const record = (overrides = {}) => ({ agent_id: "a", status: "paid", base_pay_earned: 50000, internet_allowance: 25000, bonus_commission: 10000, deductions: 0, total_pay: 85000, ...overrides }) as PayrollRecord;
it("summarizes stored values without blending currencies or cancelled records", () => {
  const result = summarizePayroll([record(), record({ agent_id: "b", base_pay_earned: 123.45, total_pay: 141.19, internet_allowance: 10, bonus_commission: 8, deductions: .26, status: "approved" }), record({ agent_id: "c", status: "cancelled", total_pay: 999999 })], new Map([["a", "NGN"], ["b", "CAD"]]));
  expect(result).toEqual({ agents: 2, paid: 1, outstanding: 1, totals: [{ currency: "NGN", gross: 50000, allowances: 25000, bonuses: 10000, deductions: 0, final: 85000 }, { currency: "CAD", gross: 123.45, allowances: 10, bonuses: 8, deductions: .26, final: 141.19 }] });
});
it("uses each record's existing source currency", () => { expect(summarizePayroll([{ ...record(), payroll_currency: "USD" }], new Map([["a", "NGN"]])).totals[0].currency).toBe("USD"); });
it("distinguishes reopened outstanding records from repaid history", () => {
  expect(isReopened(record({ reopened_at: "2026-10-02", status: "draft" }))).toBe(true);
  expect(isReopened(record({ reopened_at: "2026-10-02", status: "paid" }))).toBe(false);
});
it("agent projection excludes internal reasons and audit actors", () => {
  for (const key of ["reopen_reason", "reopened_by", "approved_by", "created_by", "details", "reason"]) expect(AGENT_PAYROLL_COLUMNS.split(",")).not.toContain(key);
  expect(AGENT_PAYROLL_COLUMNS.split(",")).toContain("admin_notes");
});
it("print statement includes escaped agent note and stored final total only", () => {
  const input: PayStatementInput = { companyName: "Winsalot Corp.", crmLabel: "Winsalot Corp Payroll", agentName: "Agent", currency: "NGN", payPeriodStart: "2026-09-19", payPeriodEnd: "2026-10-02", payday: "2026-10-02", standardWorkingDays: 10, standardBiweeklyWage: 50000, standardPaidHours: 75, daysPresent: 10, unpaidAbsenceDays: 0, regularPaidHours: 75, unpaidHours: 0, approvedPaidLeaveHours: 0, basePayEarned: 50000, incentiveBonus: 10000, otherAdditions: 0, holidayPay: 0, internetAllowance: 25000, deductions: 0, totalPay: 85000, status: "paid", actualPaymentDate: "2026-10-02", paymentMethod: "Bank Transfer", agentNote: '<script>Hi</script> & thanks', recordId: "pay1" };
  const html = buildPayStatementHtml({ ...input, reopen_reason: "PRIVATE REASON" } as PayStatementInput);
  expect(html).toContain("Notes for agent:"); expect(html).toContain("&lt;script&gt;Hi&lt;/script&gt; &amp; thanks"); expect(html).not.toContain("PRIVATE REASON"); expect(html).toContain("85,000"); expect(html).toContain("Bank Transfer"); expect(html).toContain("Record: pay1");
});
