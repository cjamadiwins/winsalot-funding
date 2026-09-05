import { describe, expect, it } from "vitest";
import {
  calculateLeaveDeductionAmountHourly,
  formatLeaveDecisionLabel,
  reconcileAttendanceStatusForStatusChange,
} from "@/lib/leave-requests";

// Two-part leave decision: Leave Status (pending/approved/declined) and
// Pay Status (pending/paid/unpaid) are decided independently, so an
// agent can end up Approved + Paid, Approved + Unpaid, or Declined -
// these tests cover the pure logic behind that policy (the DB-backed
// Server Actions that apply it to attendance/payroll are exercised
// manually against Supabase, same as the rest of this feature).
describe("reconcileAttendanceStatusForStatusChange", () => {
  it("never invents a marking for a request that was never attendance-marked", () => {
    expect(reconcileAttendanceStatusForStatusChange("none", "approved", "paid")).toBe("none");
    expect(reconcileAttendanceStatusForStatusChange("none", "approved", "unpaid")).toBe("none");
    expect(reconcileAttendanceStatusForStatusChange("none", "declined", "pending")).toBe("none");
  });

  it("Approved + Paid reconciles to paid_leave", () => {
    expect(reconcileAttendanceStatusForStatusChange("paid_leave", "approved", "paid")).toBe("paid_leave");
    expect(reconcileAttendanceStatusForStatusChange("unpaid_leave", "approved", "paid")).toBe("paid_leave");
  });

  it("Approved + Unpaid reconciles to unpaid_leave - distinct from a declined unpaid_absence", () => {
    expect(reconcileAttendanceStatusForStatusChange("paid_leave", "approved", "unpaid")).toBe("unpaid_leave");
    expect(reconcileAttendanceStatusForStatusChange("unpaid_absence", "approved", "unpaid")).toBe("unpaid_leave");
  });

  it("Approved with Pay Status still pending has nothing to record yet", () => {
    expect(reconcileAttendanceStatusForStatusChange("paid_leave", "approved", "pending")).toBe("none");
  });

  it("Declined always reconciles to unpaid_absence, regardless of Pay Status", () => {
    expect(reconcileAttendanceStatusForStatusChange("paid_leave", "declined", "pending")).toBe("unpaid_absence");
    expect(reconcileAttendanceStatusForStatusChange("unpaid_leave", "declined", "pending")).toBe("unpaid_absence");
  });

  it("Pending (re-opened) reconciles back to none - nothing decided, nothing to record", () => {
    expect(reconcileAttendanceStatusForStatusChange("paid_leave", "pending", "pending")).toBe("none");
    expect(reconcileAttendanceStatusForStatusChange("unpaid_leave", "pending", "pending")).toBe("none");
  });
});

describe("formatLeaveDecisionLabel", () => {
  it("matches the spec's own agent-history examples exactly", () => {
    expect(formatLeaveDecisionLabel("approved", "paid")).toBe("Approved / Paid");
    expect(formatLeaveDecisionLabel("approved", "unpaid")).toBe("Approved / Unpaid");
    expect(formatLeaveDecisionLabel("declined", "pending")).toBe("Declined");
    expect(formatLeaveDecisionLabel("pending", "pending")).toBe("Pending");
  });
});

describe("calculateLeaveDeductionAmountHourly", () => {
  // Approved + Unpaid and Declined both compute a deduction with the
  // exact same "existing daily/pay-period calculation" - only the
  // reason text shown to the admin differs (see markLeaveAttendanceAction
  // in both CRMs' actions.ts), never the math.
  it("computes an identical deduction for a Mon-Fri range regardless of why it's unpaid", () => {
    const standardBiweeklyWage = 150_000;
    const standardPaidHours = 75;
    const forApprovedUnpaid = calculateLeaveDeductionAmountHourly(
      "2026-09-07", // Monday
      "2026-09-11", // Friday
      standardBiweeklyWage,
      standardPaidHours
    );
    const forDeclinedAbsence = calculateLeaveDeductionAmountHourly(
      "2026-09-07",
      "2026-09-11",
      standardBiweeklyWage,
      standardPaidHours
    );
    expect(forApprovedUnpaid).toEqual(forDeclinedAbsence);
    expect(forApprovedUnpaid.scheduledDays).toBe(5);
    expect(forApprovedUnpaid.amount).toBeGreaterThan(0);
  });
});
