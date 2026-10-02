import type { PayrollCurrency, PayrollRecord } from "./payroll";

export type SharedPayrollRecord = PayrollRecord & { source_crm: "growth" | "leadgen"; payroll_currency?: PayrollCurrency };
// Never serialize internal actor IDs or reopen reasons into agent components.
export const AGENT_PAYROLL_COLUMNS = "id,agent_id,pay_period_start,pay_period_end,payday,standard_biweekly_pay,standard_working_days,standard_biweekly_wage,standard_paid_hours,regular_paid_hours,unpaid_hours,approved_paid_leave_hours,days_present,approved_paid_days,unpaid_absence_days,total_payable_days,base_pay_earned,internet_allowance,bonus_commission,other_additions,holiday_pay,deductions,total_pay,status,actual_payment_date,payment_method,admin_notes,approved_at,reopened_at,created_at,updated_at,payroll_currency";
export type AgentPayrollRecord = Omit<PayrollRecord, "approved_by" | "reopened_by" | "reopen_reason"> & { payroll_currency?: PayrollCurrency };

export function isReopened(record: Pick<PayrollRecord, "status" | "reopened_at">): boolean {
  return Boolean(record.reopened_at) && record.status !== "paid" && record.status !== "cancelled";
}

// Presentation totals use stored amounts only; currencies never get combined.
export function summarizePayroll(records: (PayrollRecord & { payroll_currency?: PayrollCurrency })[], currencyByAgent: Map<string, string>) {
  const totals = new Map<string, { gross: number; allowances: number; bonuses: number; deductions: number; final: number }>();
  for (const record of records) {
    if (record.status === "cancelled") continue;
    const currency = record.payroll_currency ?? currencyByAgent.get(record.agent_id) ?? "NGN";
    const total = totals.get(currency) ?? { gross: 0, allowances: 0, bonuses: 0, deductions: 0, final: 0 };
    total.gross += Math.round(Number(record.base_pay_earned) * 100);
    total.allowances += Math.round(Number(record.internet_allowance) * 100);
    total.bonuses += Math.round(Number(record.bonus_commission) * 100);
    total.deductions += Math.round(Number(record.deductions) * 100);
    total.final += Math.round(Number(record.total_pay) * 100);
    totals.set(currency, total);
  }
  return {
    agents: new Set(records.filter(r => r.status !== "cancelled").map(r => r.agent_id)).size,
    paid: records.filter(r => r.status === "paid").length,
    outstanding: records.filter(r => r.status === "draft" || r.status === "approved").length,
    totals: [...totals].map(([currency, t]) => ({ currency, gross: t.gross / 100, allowances: t.allowances / 100, bonuses: t.bonuses / 100, deductions: t.deductions / 100, final: t.final / 100 })),
  };
}
