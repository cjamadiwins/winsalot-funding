import { describe, expect, it } from "vitest";
import { buildPayPeriodAttendanceSummary as growthSummary, buildPayPeriodHourlySummary as growthHourly } from "../crm-attendance-report";
import { buildPayPeriodAttendanceSummary as leadgenSummary, buildPayPeriodHourlySummary as leadgenHourly } from "../leadgen-attendance-report";
import { calculateFinalPay, FIXED_INTERNET_ALLOWANCE, getPayPeriodForPayday, hourlyRate, STANDARD_BIWEEKLY_WAGE, STANDARD_PAID_HOURS } from "../payroll";
import { GOODNESS_ROWS, HENRY_ROWS } from "./fixtures/payroll-oct-2026-attendance";

// October 3-16, 2026 pay period for the two agents whose payroll showed
// 0 days present / 10 missed days / 75 unpaid hours. "Today" is Oct 16.
const TODAY = "2026-10-16";
const { start, end } = getPayPeriodForPayday("2026-10-16");
const RATE = hourlyRate(STANDARD_BIWEEKLY_WAGE, STANDARD_PAID_HOURS);

function figures(rows: typeof HENRY_ROWS) {
  const hourly = leadgenHourly(rows, start, end, TODAY, null);
  const deductions = Math.round(hourly.unpaidHours * RATE * 100) / 100;
  const finalPay = calculateFinalPay({ basePayEarned: STANDARD_BIWEEKLY_WAGE, internetAllowance: FIXED_INTERNET_ALLOWANCE, incentiveBonus: 0, otherAdditions: 0, deductions });
  return { hourly, deductions, finalPay };
}

describe("pay period resolution", () => {
  it("the Oct 16 payday closes the Oct 3 - Oct 16 period (10 weekdays, 75 scheduled hours)", () => {
    expect(start).toBe("2026-10-03");
    expect(end).toBe("2026-10-16");
    expect(leadgenHourly([], start, end, TODAY, null).scheduledPaidHours).toBe(75);
  });
});

describe("Goodness Ugbana, Oct 3-16 2026", () => {
  const f = figures(GOODNESS_ROWS);
  it("is credited for the 8 completed weekdays instead of 0", () => {
    expect(f.hourly.daysPresent).toBe(8);
    expect(f.hourly.missedDays).toBe(1); // Mon Oct 12: no attendance, no leave, no holiday on record
    expect(f.hourly.reviewDates).toEqual([]);
    expect(f.hourly.flaggedShifts).toEqual([]);
    expect(f.hourly.openTodayDate).toBe("2026-10-16"); // still clocked in; not counted until clock-out
  });
  it("pays each shift's elapsed time (no recorded breaks), capped at the 7.5h schedule", () => {
    expect(f.hourly.regularPaidHours).toBeCloseTo(56.96, 2);
    expect(f.hourly.unpaidHours).toBeCloseTo(10.54, 2);
    expect(f.hourly.regularPaidHours + f.hourly.unpaidHours).toBeCloseTo(67.5, 6); // 9 closed weekdays x 7.5h
  });
  it("gross, deduction and net", () => {
    expect(f.deductions).toBe(7029.35);
    expect(f.finalPay).toBe(67970.65);
  });
});

describe("Henry Osuji, Oct 3-16 2026", () => {
  const f = figures(HENRY_ROWS);
  it("flags the three irregular records instead of counting their elapsed time", () => {
    expect(f.hourly.flaggedShifts.map((s) => [s.id, s.elapsedMinutes])).toEqual([
      ["h-1007", 1410], // Oct 7 -> Oct 8, ~23h30m
      ["h-1009", 5751], // Oct 9 -> Oct 13, 95h51m
      ["h-1015", 1436], // Oct 15 -> Oct 16, 23h56m
    ]);
    for (const shift of f.hourly.flaggedShifts) {
      expect(shift.reasons).toContain("exceeds_max_shift");
      expect(shift.maxPayableMinutesIfConfirmed).toBe(450);
    }
  });
  it("counts only verified shifts, and leaves flagged days for review (not present, not missed)", () => {
    expect(f.hourly.daysPresent).toBe(4); // Oct 6, 8, 13, 14
    expect(f.hourly.missedDays).toBe(1); // Oct 5: no record at all
    expect(f.hourly.reviewDates).toEqual(["2026-10-07", "2026-10-09", "2026-10-12", "2026-10-15"]);
    expect(f.hourly.reviewMaxPaidHours).toBe(30);
    expect(f.hourly.regularPaidHours).toBeCloseTo(23.61, 2);
    expect(f.hourly.unpaidHours).toBeCloseTo(13.89, 2);
  });
  it("95h51m never inflates paid hours or overtime", () => {
    expect(f.hourly.regularPaidHours).toBeLessThan(75);
    const elapsedHours = HENRY_ROWS.reduce((s, r) => s + (r.total_minutes ?? 0), 0) / 60;
    expect(elapsedHours).toBeGreaterThan(100);
    expect(f.hourly.regularPaidHours).toBeLessThan(30);
  });
  it("gross, deduction and net (verified shifts only)", () => {
    expect(f.deductions).toBe(9257.32);
    expect(f.finalPay).toBe(65742.68);
  });
});

describe("both CRMs calculate identically", () => {
  it.each([
    ["Goodness", GOODNESS_ROWS],
    ["Henry", HENRY_ROWS],
  ])("%s: Growth and Lead Gen builders return identical summaries", (_name, rows) => {
    expect(growthHourly(rows, start, end, TODAY, null)).toEqual(leadgenHourly(rows, start, end, TODAY, null));
    expect(growthSummary(rows, start, end, TODAY)).toEqual(leadgenSummary(rows, start, end, TODAY));
  });
  it("the attendance summary and hourly summary agree on days present", () => {
    for (const rows of [GOODNESS_ROWS, HENRY_ROWS]) {
      expect(leadgenSummary(rows, start, end, TODAY).daysPresent).toBe(leadgenHourly(rows, start, end, TODAY, null).daysPresent);
    }
  });
});
