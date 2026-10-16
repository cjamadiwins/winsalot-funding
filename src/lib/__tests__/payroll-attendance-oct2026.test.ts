import { describe, expect, it } from "vitest";
import { buildPayPeriodAttendanceSummary as growthSummary, buildPayPeriodHourlySummary as growthHourly } from "../crm-attendance-report";
import { buildPayPeriodAttendanceSummary as leadgenSummary, buildPayPeriodHourlySummary as leadgenHourly } from "../leadgen-attendance-report";
import { calculateFinalPay, calculateGrossWageEarnings, FIXED_INTERNET_ALLOWANCE, getPayPeriodForPayday, hourlyRate, STANDARD_BIWEEKLY_WAGE, STANDARD_PAID_HOURS } from "../payroll";
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

// ---------------------------------------------------------------------
// Oct 12, 2026 (Thanksgiving) approved as a paid statutory holiday for both
// agents, paid at the regular daily rate (50,000 / 10 = 5,000), not worked.
// ---------------------------------------------------------------------
const HOLIDAYS = ["2026-10-12"];
const HOLIDAY_PAY = 5000;

function holidayFigures(rows: typeof HENRY_ROWS) {
  const hourly = leadgenHourly(rows, start, end, TODAY, null, HOLIDAYS);
  const deductions = Math.round(hourly.unpaidHours * RATE * 100) / 100;
  const base = calculateGrossWageEarnings(STANDARD_BIWEEKLY_WAGE, STANDARD_PAID_HOURS - hourly.holidayWageOffsetHours, STANDARD_PAID_HOURS);
  const finalPay = calculateFinalPay({ basePayEarned: base, internetAllowance: FIXED_INTERNET_ALLOWANCE, incentiveBonus: 0, otherAdditions: 0, holidayPay: HOLIDAY_PAY, deductions });
  return { hourly, deductions, base, finalPay };
}

describe("Oct 12 approved paid holiday", () => {
  const g = holidayFigures(GOODNESS_ROWS);
  const h = holidayFigures(HENRY_ROWS);

  it("is not a missed day or unpaid time, and not hours worked", () => {
    for (const f of [g, h]) {
      expect(f.hourly.holidayOffDates).toEqual(["2026-10-12"]);
      expect(f.hourly.holidayWageOffsetHours).toBe(7.5);
      expect(f.hourly.missedDays).toBe(f === g ? 0 : 1); // Henry's remaining miss is Oct 5
      expect(f.hourly.reviewDates).not.toContain("2026-10-12");
    }
    // worked hours are unchanged by the holiday
    expect(g.hourly.regularPaidHours).toBeCloseTo(56.96, 2);
    expect(h.hourly.regularPaidHours).toBeCloseTo(23.61, 2);
  });

  it("Goodness: holiday pay replaces the day's wage; only worked-day shortfall is deducted", () => {
    expect(g.hourly.unpaidHours).toBeCloseTo(3.04, 2); // 8 worked days, 8 x 7.5h = 60h scheduled, 56.96h paid
    expect(g.base).toBe(45000);
    expect(g.deductions).toBe(2029.35);
    expect(g.base + HOLIDAY_PAY + FIXED_INTERNET_ALLOWANCE).toBe(75000); // gross
    expect(g.finalPay).toBe(72970.65);
  });

  it("Henry: same rule; flagged days stay for review but Oct 12 no longer does", () => {
    expect(h.hourly.reviewDates).toEqual(["2026-10-07", "2026-10-09", "2026-10-15"]);
    expect(h.hourly.reviewMaxPaidHours).toBe(22.5);
    // Unpaid = Oct 5 (missed, 7.5h) + shortfall on his 4 verified shifts (6.39h).
    expect(h.hourly.unpaidHours).toBeCloseTo(13.89, 2);
    expect(h.base).toBe(45000);
    expect(h.deductions).toBe(9257.32);
    expect(h.finalPay).toBe(65742.68);
  });

  it("the holiday is paid exactly once for each agent", () => {
    // Goodness: Oct 12 was previously deducted as a missed day -> +5,000.
    expect(Math.round((g.finalPay - figures(GOODNESS_ROWS).finalPay) * 100) / 100).toBe(5000);
    // Henry: Oct 12 sat inside a flagged record and was never deducted (his
    // full wage already covered it) -> net unchanged, now shown as holiday pay.
    expect(Math.round((h.finalPay - figures(HENRY_ROWS).finalPay) * 100) / 100).toBe(0);
  });

  it("a holiday that WAS worked is paid as worked (no wage offset)", () => {
    const worked = [...GOODNESS_ROWS, { ...GOODNESS_ROWS[3], id: "g-1012", clock_in: "2026-10-12T14:00:00.000Z", clock_out: "2026-10-12T21:00:00.000Z", total_minutes: 420 }];
    const hourly = leadgenHourly(worked, start, end, TODAY, null, HOLIDAYS);
    expect(hourly.holidayOffDates).toEqual([]);
    expect(hourly.holidayWageOffsetHours).toBe(0);
    expect(hourly.daysPresent).toBe(9);
  });

  it("Growth and Lead Gen builders agree with the holiday applied", () => {
    for (const rows of [GOODNESS_ROWS, HENRY_ROWS]) {
      expect(growthHourly(rows, start, end, TODAY, null, HOLIDAYS)).toEqual(leadgenHourly(rows, start, end, TODAY, null, HOLIDAYS));
      expect(growthSummary(rows, start, end, TODAY, HOLIDAYS)).toEqual(leadgenSummary(rows, start, end, TODAY, HOLIDAYS));
    }
  });
});
