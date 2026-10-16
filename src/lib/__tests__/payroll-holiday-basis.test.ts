import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOODNESS_ID, GOODNESS_ROWS, HENRY_ID, HENRY_ROWS } from "./fixtures/payroll-oct-2026-attendance";

const m = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../payroll-attendance-data", () => ({ loadPayrollAttendance: m.load }));
import { computeHolidayAdjustedBase, holidayPayShortfallMessage } from "../payroll-holiday-basis";

const THANKSGIVING = { name: "Thanksgiving Day", date: "2026-10-12", paymentType: "regular_paid_day" as const, effectiveAmount: 5000 };
function loaded(rows: typeof HENRY_ROWS, holidays: (typeof THANKSGIVING)[]) {
  return { data: { rows, scheduledStartTime: null, sourceCounts: { growth: 0, leadgen: rows.length }, duplicatesRemoved: 0, paidHolidays: holidays, holidayDates: holidays.map((h) => h.date) } };
}
beforeEach(() => m.load.mockReset());

describe("computeHolidayAdjustedBase", () => {
  it.each([
    ["Goodness", GOODNESS_ID, GOODNESS_ROWS],
    ["Henry", HENRY_ID, HENRY_ROWS],
  ])("%s: unworked paid holiday replaces 7.5h of wage (50,000 -> 45,000) and expects 5,000 holiday pay", async (_n, id, rows) => {
    m.load.mockResolvedValue(loaded(rows, [THANKSGIVING]));
    const { result } = await computeHolidayAdjustedBase({ agentId: id, payday: "2026-10-16", standardBiweeklyWage: 50000, standardPaidHours: 75 });
    expect(m.load).toHaveBeenCalledWith(id, "2026-10-03", "2026-10-16", "2026-10-16");
    expect(result).toEqual({ basePayEarned: 45000, holidayOffDates: ["2026-10-12"], holidayOffHours: 7.5, expectedHolidayPay: 5000 });
  });

  it("no holiday: base is the full standard wage, exactly as before", async () => {
    m.load.mockResolvedValue(loaded(GOODNESS_ROWS, []));
    const { result } = await computeHolidayAdjustedBase({ agentId: GOODNESS_ID, payday: "2026-10-16", standardBiweeklyWage: 50000, standardPaidHours: 75 });
    expect(result?.basePayEarned).toBe(50000);
    expect(result?.expectedHolidayPay).toBe(0);
  });

  it("a worked holiday does not reduce the wage", async () => {
    const worked = [...GOODNESS_ROWS, { ...GOODNESS_ROWS[3], id: "g-1012", clock_in: "2026-10-12T14:00:00.000Z", clock_out: "2026-10-12T21:00:00.000Z", total_minutes: 420 }];
    m.load.mockResolvedValue(loaded(worked, [THANKSGIVING]));
    const { result } = await computeHolidayAdjustedBase({ agentId: GOODNESS_ID, payday: "2026-10-16", standardBiweeklyWage: 50000, standardPaidHours: 75 });
    expect(result?.basePayEarned).toBe(50000);
    expect(result?.holidayOffDates).toEqual([]);
  });

  it("surfaces a load failure instead of silently paying the full wage", async () => {
    m.load.mockResolvedValue({ error: "Failed to load holiday pay: boom" });
    const out = await computeHolidayAdjustedBase({ agentId: GOODNESS_ID, payday: "2026-10-16", standardBiweeklyWage: 50000, standardPaidHours: 75 });
    expect(out.error).toMatch(/boom/);
    expect(out.result).toBeUndefined();
  });
});

describe("holidayPayShortfallMessage", () => {
  const basis = { basePayEarned: 45000, holidayOffDates: ["2026-10-12"], holidayOffHours: 7.5, expectedHolidayPay: 5000 };
  it("blocks a save that would drop the holiday pay (agent would lose the day)", () => {
    expect(holidayPayShortfallMessage(basis, 0)).toMatch(/at least 5000\.00/);
    expect(holidayPayShortfallMessage(basis, 4999.99)).not.toBeNull();
  });
  it("allows holiday pay at or above the expected amount, and records with no off-day holiday", () => {
    expect(holidayPayShortfallMessage(basis, 5000)).toBeNull();
    expect(holidayPayShortfallMessage(basis, 6000)).toBeNull();
    expect(holidayPayShortfallMessage({ ...basis, holidayOffDates: [], expectedHolidayPay: 0 }, 0)).toBeNull();
  });
});
