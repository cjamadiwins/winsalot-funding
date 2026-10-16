import { describe, expect, it } from "vitest";
import { analyzePayPeriod, irregularShiftReasons, mergeAttendanceSources, type PayrollShiftRow } from "../payroll-attendance";
import { crmDateKey } from "../crm-performance";

const key = crmDateKey; // America/Toronto
const AGENT = "agent-1";
let n = 0;
function shift(inIso: string, outIso: string | null, extra: Partial<PayrollShiftRow> = {}): PayrollShiftRow {
  const minutes = outIso ? Math.round((Date.parse(outIso) - Date.parse(inIso)) / 60000) : null;
  return {
    id: `s${++n}`, agent_id: AGENT, clock_in: inIso, clock_out: outIso, total_minutes: minutes,
    break1_start: null, break1_end: null, lunch_start: null, lunch_end: null, break2_start: null, break2_end: null, ...extra,
  };
}

describe("irregularShiftReasons", () => {
  it("accepts a normal 8h shift and a normal overnight shift", () => {
    expect(irregularShiftReasons(shift("2026-10-05T14:00:00Z", "2026-10-05T22:00:00Z"), key)).toEqual([]);
    expect(irregularShiftReasons(shift("2026-10-05T23:00:00Z", "2026-10-06T07:00:00Z"), key)).toEqual([]);
  });
  it("flags >12h records, and says when they span days", () => {
    expect(irregularShiftReasons(shift("2026-10-05T14:00:00Z", "2026-10-05T14:00:00Z"), key)).toEqual(["invalid_times"]);
    expect(irregularShiftReasons(shift("2026-10-05T14:00:00Z", "2026-10-06T14:00:00Z"), key)).toEqual(["exceeds_max_shift", "spans_multiple_days"]);
  });
  it("never flags an open shift", () => {
    expect(irregularShiftReasons(shift("2026-10-05T14:00:00Z", null), key)).toEqual([]);
  });
});

describe("mergeAttendanceSources", () => {
  it("counts the same clock-in written to both CRM tables once, keeping the completed copy", () => {
    const open = shift("2026-10-05T14:00:00Z", null);
    const closed = shift("2026-10-05T14:00:03Z", "2026-10-05T21:00:00Z");
    const { rows, duplicatesRemoved } = mergeAttendanceSources([
      { source: "leadgen", rows: [open] },
      { source: "growth", rows: [closed] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(closed.id);
    expect(rows[0].source).toBe("growth");
    expect(duplicatesRemoved).toEqual([{ keptId: closed.id, droppedId: open.id, droppedSource: "leadgen" }]);
  });
  it("keeps distinct shifts from both tables (agent moved CRMs mid-period)", () => {
    const a = shift("2026-09-28T14:00:00Z", "2026-09-28T21:00:00Z");
    const b = shift("2026-10-05T14:00:00Z", "2026-10-05T21:00:00Z");
    const { rows } = mergeAttendanceSources([
      { source: "growth", rows: [a] },
      { source: "leadgen", rows: [b] },
    ]);
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
  });
  it("lets the first-listed source win an identical tie", () => {
    const a = shift("2026-10-05T14:00:00Z", "2026-10-05T21:00:00Z");
    const b = { ...a, id: "copy" };
    const { rows } = mergeAttendanceSources([
      { source: "leadgen", rows: [a] },
      { source: "growth", rows: [b] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("leadgen");
  });
});

describe("analyzePayPeriod", () => {
  const analyze = (rows: PayrollShiftRow[], today = "2026-10-20") => analyzePayPeriod(rows, "2026-10-05", "2026-10-11", today, null, key);

  it("full-attendance week is 5 days present, no unpaid time", () => {
    const rows = ["05", "06", "07", "08", "09"].map((d) => shift(`2026-10-${d}T14:00:00Z`, `2026-10-${d}T21:30:00Z`));
    const a = analyze(rows);
    expect(a.daysPresent).toBe(5);
    expect(a.regularPaidMinutes).toBe(5 * 450);
    expect(a.unpaidMinutes).toBe(0);
    expect(a.missedDates).toEqual([]);
  });
  it("a weekday with nothing at all is a full unpaid 7.5h missed day; weekends are ignored", () => {
    const a = analyze([shift("2026-10-05T14:00:00Z", "2026-10-05T21:30:00Z"), shift("2026-10-10T14:00:00Z", "2026-10-10T21:30:00Z")]);
    expect(a.daysPresent).toBe(1);
    expect(a.missedDates).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(a.unpaidMinutes).toBe(4 * 450);
  });
  it("buckets by Toronto day, not UTC (a 9pm ET shift is next day in UTC)", () => {
    const a = analyze([shift("2026-10-06T01:00:00Z", "2026-10-06T09:00:00Z")]); // Oct 5 9pm - Oct 6 5am ET
    expect(a.days.find((d) => d.dateKey === "2026-10-05")?.minutes).toBe(480);
    expect(a.daysPresent).toBe(1);
  });
  it("a split day cannot pay more than 7.5h or deduct twice", () => {
    const a = analyze([shift("2026-10-05T13:00:00Z", "2026-10-05T17:00:00Z"), shift("2026-10-05T18:00:00Z", "2026-10-05T22:00:00Z")]);
    expect(a.regularPaidMinutes).toBe(450); // 480 worked, capped
    expect(a.unpaidMinutes).toBe(4 * 450); // only the 4 genuinely missed days
  });
  it("a flagged record is not counted as work; its weekdays are reviewed, not missed", () => {
    const long = shift("2026-10-06T14:00:00Z", "2026-10-08T14:00:00Z"); // Tue 10:00 -> Thu 10:00, 48h
    const a = analyze([long]);
    expect(a.daysPresent).toBe(0);
    expect(a.regularPaidMinutes).toBe(0);
    expect(a.reviewDates).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(a.missedDates).toEqual(["2026-10-05", "2026-10-09"]);
    expect(a.flaggedShifts).toHaveLength(1);
    expect(a.flaggedShifts[0].elapsedMinutes).toBe(48 * 60);
    expect(a.flaggedShifts[0].coveredWeekdays).toEqual(["2026-10-07", "2026-10-08"]);
  });
  it("a verified shift on the same day as a flagged record still counts", () => {
    const long = shift("2026-10-05T14:00:00Z", "2026-10-06T14:00:00Z");
    const normal = shift("2026-10-06T14:00:00Z", "2026-10-06T21:00:00Z");
    const a = analyze([long, normal]);
    expect(a.daysPresent).toBe(1);
    expect(a.reviewDates).toEqual(["2026-10-05"]);
  });
  it("a long record that began before the period still protects the days it runs into", () => {
    const long = shift("2026-10-02T14:00:00Z", "2026-10-06T14:00:00Z");
    const a = analyze([long]);
    expect(a.reviewDates).toContain("2026-10-05");
    expect(a.missedDates).not.toContain("2026-10-05");
    expect(a.flaggedShifts).toHaveLength(1);
  });
  it("today's open shift is neither present nor missed; an old open shift is flagged", () => {
    const a = analyze([shift("2026-10-05T14:00:00Z", null), shift("2026-10-06T14:00:00Z", null)], "2026-10-06");
    expect(a.openTodayDate).toBe("2026-10-06");
    expect(a.flaggedDates).toEqual(["2026-10-05"]);
    expect(a.daysPresent).toBe(0);
    expect(a.missedDates).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
  });
  it("recorded excess break time and lunch still reduce paid minutes", () => {
    const withLunch = shift("2026-10-05T13:00:00Z", "2026-10-05T21:00:00Z", { lunch_start: "2026-10-05T17:00:00Z", lunch_end: "2026-10-05T17:30:00Z" });
    const a = analyze([withLunch]);
    expect(a.regularPaidMinutes).toBe(450); // 480 - 30 lunch
  });
});

describe("analyzePayPeriod with approved paid holidays", () => {
  const analyze = (rows: PayrollShiftRow[], holidays: string[]) => analyzePayPeriod(rows, "2026-10-05", "2026-10-11", "2026-10-20", null, key, holidays);
  const normal = (d: string) => shift(`2026-10-${d}T14:00:00Z`, `2026-10-${d}T21:30:00Z`);

  it("an unworked paid holiday is not missed, not unpaid, and not worked", () => {
    const a = analyze([normal("05"), normal("07"), normal("08"), normal("09")], ["2026-10-06"]);
    expect(a.holidayDates).toEqual(["2026-10-06"]);
    expect(a.holidayOffDates).toEqual(["2026-10-06"]);
    expect(a.missedDates).toEqual([]);
    expect(a.daysPresent).toBe(4);
    expect(a.unpaidMinutes).toBe(0);
    expect(a.regularPaidMinutes).toBe(4 * 450);
  });
  it("the same day without the holiday is a full unpaid missed day", () => {
    const a = analyze([normal("05"), normal("07"), normal("08"), normal("09")], []);
    expect(a.missedDates).toEqual(["2026-10-06"]);
    expect(a.unpaidMinutes).toBe(450);
  });
  it("a holiday that was worked counts as worked and is not an off day", () => {
    const a = analyze([normal("05"), normal("06")], ["2026-10-06"]);
    expect(a.holidayDates).toEqual(["2026-10-06"]);
    expect(a.holidayOffDates).toEqual([]);
    expect(a.daysPresent).toBe(2);
  });
  it("a flagged long record covering the holiday does not turn it into a review day or hours worked", () => {
    const long = shift("2026-10-05T14:00:00Z", "2026-10-08T14:00:00Z");
    const a = analyze([long], ["2026-10-06"]);
    expect(a.reviewDates).not.toContain("2026-10-06");
    expect(a.holidayOffDates).toContain("2026-10-06");
    expect(a.regularPaidMinutes).toBe(0);
    expect(a.flaggedShifts).toHaveLength(1);
  });
  it("a holiday on a weekend adds nothing", () => {
    const a = analyze([normal("05")], ["2026-10-10"]);
    expect(a.holidayDates).toEqual([]);
    expect(a.holidayOffDates).toEqual([]);
  });
});
