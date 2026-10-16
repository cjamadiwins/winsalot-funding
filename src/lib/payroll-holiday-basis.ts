import "server-only";
import { analyzePayPeriod, holidayWageOffsetHours } from "./payroll-attendance";
import { loadPayrollAttendance } from "./payroll-attendance-data";
import { leadgenDateKey } from "./leadgen-performance";
import { calculateGrossWageEarnings, getPayPeriodForPayday } from "./payroll";

// Authoritative base wage for a payroll record, computed server-side (never
// trusted from the form) identically for both CRMs.
//
// An approved paid holiday the agent did not work is paid through holiday
// pay, not through the period wage - otherwise that day would be paid twice.
// So the base wage is reduced by the hours those days stand for (7.5h each,
// via calculateGrossWageEarnings' proration), and the record must then carry
// the holiday pay. Records with no unworked paid holiday are unchanged:
// base = the standard wage.
export type HolidayAdjustedBase = {
  basePayEarned: number;
  holidayOffDates: string[];
  holidayOffHours: number;
  expectedHolidayPay: number;
};

export async function computeHolidayAdjustedBase(params: {
  agentId: string;
  payday: string;
  standardBiweeklyWage: number;
  standardPaidHours: number;
}): Promise<{ error?: string; result?: HolidayAdjustedBase }> {
  const { agentId, payday, standardBiweeklyWage, standardPaidHours } = params;
  const fullWage = Math.round(standardBiweeklyWage * 100) / 100;
  const { start, end } = getPayPeriodForPayday(payday);

  const loaded = await loadPayrollAttendance(agentId, start, end, payday);
  if (loaded.error || !loaded.data) return { error: loaded.error ?? "Failed to check holidays for this pay period." };
  if (loaded.data.holidayDates.length === 0) {
    return { result: { basePayEarned: fullWage, holidayOffDates: [], holidayOffHours: 0, expectedHolidayPay: 0 } };
  }

  const todayKey = leadgenDateKey(new Date().toISOString());
  const analysis = analyzePayPeriod(loaded.data.rows, start, end, todayKey, loaded.data.scheduledStartTime, leadgenDateKey, loaded.data.holidayDates);
  const holidayOffDates = analysis.holidayOffDates;
  if (holidayOffDates.length === 0 || standardPaidHours <= 0) {
    return { result: { basePayEarned: fullWage, holidayOffDates, holidayOffHours: 0, expectedHolidayPay: 0 } };
  }

  const holidayOffHours = holidayWageOffsetHours(holidayOffDates.length);
  const expectedHolidayPay =
    Math.round(loaded.data.paidHolidays.filter((h) => holidayOffDates.includes(h.date)).reduce((sum, h) => sum + h.effectiveAmount, 0) * 100) / 100;
  return {
    result: {
      basePayEarned: calculateGrossWageEarnings(standardBiweeklyWage, Math.max(0, standardPaidHours - holidayOffHours), standardPaidHours),
      holidayOffDates,
      holidayOffHours,
      expectedHolidayPay,
    },
  };
}

// Guard: a record whose wage no longer covers an unworked paid holiday must
// include that holiday's pay, or the agent would silently lose the day.
export function holidayPayShortfallMessage(basis: HolidayAdjustedBase, submittedHolidayPay: number): string | null {
  if (basis.holidayOffDates.length === 0) return null;
  if (submittedHolidayPay + 0.005 >= basis.expectedHolidayPay) return null;
  return `This pay period includes an approved paid holiday that was not worked. Its wage is replaced by holiday pay, so Holiday Pay must be at least ${basis.expectedHolidayPay.toFixed(2)} (use Refresh Attendance or Load Holiday Pay).`;
}
