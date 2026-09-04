import { describe, expect, it } from "vitest";
import {
  assignmentCrm,
  calculateHolidayPayAmount,
  HOLIDAY_PAY_CURRENCY,
  isAssignmentActive,
  isHolidayActive,
  sharedIdentityKeyForEmail,
} from "@/lib/holiday-pay";
import { dailyRate, STANDARD_BIWEEKLY_WAGE, STANDARD_WORKING_DAYS } from "@/lib/payroll";

const STANDARD_DAILY_RATE = dailyRate(STANDARD_BIWEEKLY_WAGE, STANDARD_WORKING_DAYS);

describe("HOLIDAY_PAY_CURRENCY", () => {
  it("is NGN - holiday pay always follows the agents' payroll currency, independent of a holiday's jurisdiction", () => {
    expect(HOLIDAY_PAY_CURRENCY).toBe("NGN");
  });
});

describe("calculateHolidayPayAmount", () => {
  it("returns 0 for an unpaid holiday regardless of amount/percentage", () => {
    expect(calculateHolidayPayAmount("unpaid", 10_000, 150)).toBe(0);
    expect(calculateHolidayPayAmount("unpaid", null, null)).toBe(0);
  });

  it("returns the flat amount for a fixed_amount holiday", () => {
    expect(calculateHolidayPayAmount("fixed_amount", 15_000, null)).toBe(15_000);
  });

  it("never returns a negative amount for a fixed_amount holiday with a bad/missing value", () => {
    expect(calculateHolidayPayAmount("fixed_amount", null, null)).toBe(0);
    expect(calculateHolidayPayAmount("fixed_amount", -500, null)).toBe(0);
  });

  it("computes a percentage premium off the standard daily rate", () => {
    expect(calculateHolidayPayAmount("percentage_premium", null, 100)).toBe(STANDARD_DAILY_RATE);
    expect(calculateHolidayPayAmount("percentage_premium", null, 150)).toBe(
      Math.round(STANDARD_DAILY_RATE * 1.5 * 100) / 100
    );
  });

  it("returns the standard daily rate for a regular paid day", () => {
    expect(calculateHolidayPayAmount("regular_paid_day", null, null)).toBe(STANDARD_DAILY_RATE);
  });
});

describe("sharedIdentityKeyForEmail", () => {
  it("lower-cases and trims so the same mailbox always matches", () => {
    expect(sharedIdentityKeyForEmail("  Agent@WinsalotCorp.com ")).toBe("agent@winsalotcorp.com");
  });

  it("two differently-cased emails for the same person produce the same key", () => {
    expect(sharedIdentityKeyForEmail("Jane.Doe@Example.com")).toBe(sharedIdentityKeyForEmail("jane.doe@example.com"));
  });
});

describe("assignmentCrm", () => {
  it("identifies a Growth CRM assignment by crm_user_id", () => {
    expect(assignmentCrm({ crm_user_id: "u1", leadgen_user_id: null })).toBe("growth");
  });

  it("identifies a Lead Generation CRM assignment by leadgen_user_id", () => {
    expect(assignmentCrm({ crm_user_id: null, leadgen_user_id: "u1" })).toBe("leadgen");
  });
});

describe("isHolidayActive / isAssignmentActive", () => {
  it("a holiday is active only when is_active is true and it isn't soft-deleted", () => {
    expect(isHolidayActive({ is_active: true, deleted_at: null })).toBe(true);
    expect(isHolidayActive({ is_active: false, deleted_at: null })).toBe(false);
    expect(isHolidayActive({ is_active: true, deleted_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });

  it("an assignment is active only when its status is 'assigned'", () => {
    expect(isAssignmentActive({ status: "assigned" })).toBe(true);
    expect(isAssignmentActive({ status: "cancelled" })).toBe(false);
  });
});
