import { describe, expect, it } from "vitest";
import {
  CALL_LIST_PROGRESS_LABELS,
  CALL_LIST_PROGRESS_STYLES,
  computeCallListProgress,
  computeProgressBySegment,
  formatLastWorked,
  getCallListProgressStatus,
  type CallListProgressLead,
} from "@/lib/call-list-progress";

const lead = (over: Partial<CallListProgressLead> = {}): CallListProgressLead => ({
  segment_id: "s1",
  last_outcome: null,
  last_contacted_at: null,
  callback_at: null,
  ...over,
});
const make = (total: number, worked: number) =>
  Array.from({ length: total }, (_, i) => (i < worked ? lead({ last_outcome: "No Answer", last_contacted_at: "2026-09-01T10:00:00Z" }) : lead()));

describe("call list progress status", () => {
  it("untouched list is Not Started", () => {
    expect(computeCallListProgress(make(95, 0)).status).toBe("not_started");
    expect(computeCallListProgress([]).status).toBe("not_started");
  });
  it("1-74% is In Progress", () => {
    expect(computeCallListProgress(make(95, 1)).status).toBe("in_progress");
    expect(computeCallListProgress(make(95, 63))).toMatchObject({ status: "in_progress", progressPercent: 66, unworkedLeads: 32 });
    expect(getCallListProgressStatus(100, 74)).toBe("in_progress");
  });
  it("75-99% is Mostly Worked", () => {
    expect(getCallListProgressStatus(100, 75)).toBe("mostly_worked");
    expect(computeCallListProgress(make(100, 99)).status).toBe("mostly_worked");
  });
  it("99.6% never rounds up to Completed", () => {
    const p = computeCallListProgress(make(1000, 996));
    expect(p.progressPercent).toBe(99);
    expect(p.status).toBe("mostly_worked");
  });
  it("100% is Completed", () => {
    expect(computeCallListProgress(make(10, 10))).toMatchObject({ status: "completed", progressPercent: 100, unworkedLeads: 0 });
  });
  it("Paused wins only when a paused state applies", () => {
    expect(computeCallListProgress(make(10, 5), true).status).toBe("paused");
    expect(computeCallListProgress(make(10, 5), false).status).toBe("in_progress");
  });
});

describe("call list progress counting", () => {
  it("counts every call disposition as worked, once per lead", () => {
    const outcomes = ["No Answer", "Voicemail", "Gatekeeper", "Not Interested", "Callback", "Interested", "Appointment Booked", "Do Not Call"];
    const p = computeCallListProgress(outcomes.map((o) => lead({ last_outcome: o, last_contacted_at: "2026-09-01T10:00:00Z" })));
    expect(p.workedLeads).toBe(8);
    expect(p.unworkedLeads).toBe(0);
  });
  it("one lead called many times is one worked lead (one row per lead)", () => {
    const p = computeCallListProgress([lead({ last_outcome: "Callback", last_contacted_at: "2026-09-03T10:00:00Z" }), lead(), lead(), lead()]);
    expect(p.workedLeads).toBe(1);
    expect(p.progressPercent).toBe(25);
  });
  it("callbacks stay visible separately and don't alter worked counts", () => {
    const p = computeCallListProgress([
      lead({ last_outcome: "Callback", last_contacted_at: "2026-09-01T10:00:00Z", callback_at: "2026-09-09T10:00:00Z" }),
      lead({ last_outcome: "No Answer", last_contacted_at: "2026-09-01T11:00:00Z" }),
    ]);
    expect(p).toMatchObject({ workedLeads: 2, status: "completed", pendingFollowUps: 1 });
  });
  it("a callback alone without an outcome does not make a lead worked", () => {
    expect(computeCallListProgress([lead({ callback_at: "2026-09-09T10:00:00Z" })])).toMatchObject({ workedLeads: 0, pendingFollowUps: 1 });
  });
  it("ignores removed leads", () => {
    const p = computeCallListProgress([lead({ last_outcome: "No Answer", last_contacted_at: "2026-09-01T10:00:00Z" }), lead({ removed_at: "2026-09-02T00:00:00Z" })]);
    expect(p.totalLeads).toBe(1);
    expect(p.status).toBe("completed");
  });
  it("last worked is the most recent contact", () => {
    const p = computeCallListProgress([
      lead({ last_outcome: "No Answer", last_contacted_at: "2026-09-01T10:00:00Z" }),
      lead({ last_outcome: "Voicemail", last_contacted_at: "2026-09-05T10:00:00Z" }),
    ]);
    expect(p.lastWorkedAt).toBe("2026-09-05T10:00:00Z");
    expect(computeCallListProgress(make(3, 0)).lastWorkedAt).toBeNull();
  });
  it("groups per segment and applies paused per segment", () => {
    const map = computeProgressBySegment(
      [lead({ segment_id: "a", last_outcome: "Voicemail", last_contacted_at: "2026-09-01T10:00:00Z" }), lead({ segment_id: "b" })],
      new Set(["b"])
    );
    expect(map.get("a")?.status).toBe("completed");
    expect(map.get("b")?.status).toBe("paused");
  });
});

describe("call list progress presentation", () => {
  it("never uses red and maps In Progress to green, Completed to blue", () => {
    const all = JSON.stringify(CALL_LIST_PROGRESS_STYLES);
    expect(all).not.toMatch(/red|rose|pink|orange|violet|purple/);
    expect(CALL_LIST_PROGRESS_STYLES.in_progress.bar).toContain("emerald");
    expect(CALL_LIST_PROGRESS_STYLES.completed.bar).toContain("blue");
    expect(CALL_LIST_PROGRESS_STYLES.not_started.bar).toBe("bg-slate-300");
    expect(CALL_LIST_PROGRESS_STYLES.paused.bar).toBe("bg-slate-600");
    expect(CALL_LIST_PROGRESS_STYLES.mostly_worked.bar).toContain("amber");
    expect(CALL_LIST_PROGRESS_LABELS.in_progress).toBe("In Progress");
  });
  it("formats last worked as Today / Yesterday / date", () => {
    const now = new Date(2026, 8, 30, 15, 0);
    expect(formatLastWorked(new Date(2026, 8, 30, 14, 14).toISOString(), now)).toMatch(/^Today, /);
    expect(formatLastWorked(new Date(2026, 8, 29, 9, 0).toISOString(), now)).toMatch(/^Yesterday, /);
    expect(formatLastWorked(new Date(2026, 8, 1, 9, 0).toISOString(), now)).not.toMatch(/Today|Yesterday/);
    expect(formatLastWorked(null, now)).toBe("—");
  });
});
