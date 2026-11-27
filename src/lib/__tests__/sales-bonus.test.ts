import { describe, expect, it } from "vitest";
import { formatBonusAmount, saleConfirmationState, salesBonusPayrollCost, summarizeSalesBonuses } from "../sales-bonus";

const bonus = (o: Record<string, unknown> = {}) => ({
  bonus_amount: 50,
  currency: "CAD",
  agent_payment_status: "pending",
  client_payment_status: "receivable",
  accounting_treatment: "client_receivable",
  ...o,
}) as Parameters<typeof summarizeSalesBonuses>[0][number];

describe("summarizeSalesBonuses", () => {
  it("separates agent payment from client payment", () => {
    const totals = summarizeSalesBonuses([
      bonus(), // Teknokraft, pending, client owes
      bonus({ agent_payment_status: "paid", client_payment_status: "receivable" }), // agent paid, client still owes
      bonus({ agent_payment_status: "approved", client_payment_status: "received" }),
      bonus({ agent_payment_status: "approved", client_payment_status: "not_applicable", accounting_treatment: "winsalot_bonus_expense" }),
      bonus({ agent_payment_status: "pending", client_payment_status: "not_applicable", accounting_treatment: "winsalot_bonus_expense" }),
    ]).CAD;
    expect(totals).toEqual({ pending: 100, approved: 100, paid: 50, clientReceivableOutstanding: 100, clientReceived: 50, winsalotBonusExpense: 50 });
  });

  it("ignores voided bonuses entirely", () => {
    expect(summarizeSalesBonuses([bonus({ agent_payment_status: "voided" })])).toEqual({});
  });

  it("sums in cents without floating-point drift", () => {
    const rows = Array.from({ length: 3 }, () => bonus({ bonus_amount: "0.10" }));
    expect(summarizeSalesBonuses(rows).CAD.pending).toBe(0.3);
  });
});

describe("salesBonusPayrollCost", () => {
  it("counts approved and paid bonuses only, per currency", () => {
    expect(salesBonusPayrollCost([bonus(), bonus({ agent_payment_status: "approved" }), bonus({ agent_payment_status: "paid" }), bonus({ agent_payment_status: "voided" })])).toEqual({ CAD: 100 });
    expect(salesBonusPayrollCost([bonus()])).toEqual({});
  });
});

describe("saleConfirmationState", () => {
  const programs = new Set(["tek", "hid"]);
  const appt = { id: "a1", client_id: "tek", lead_id: "l1", status: "Completed", booking_agent_id: "agent" };

  it("offers confirmation for a normal program appointment", () => {
    expect(saleConfirmationState(appt, programs, [])).toEqual({ kind: "confirmable" });
  });
  it("offers nothing for clients without a program", () => {
    expect(saleConfirmationState({ ...appt, client_id: "web6" }, programs, [])).toEqual({ kind: "no_program" });
  });
  it("blocks a second bonus for the same appointment or the same lead on another appointment", () => {
    const existing = { id: "b1", appointment_id: "a1", lead_id: "l1", agent_payment_status: "pending" as const };
    expect(saleConfirmationState(appt, programs, [existing]).kind).toBe("confirmed");
    expect(saleConfirmationState({ ...appt, id: "a2" }, programs, [existing]).kind).toBe("confirmed");
  });
  it("allows re-confirmation after a bonus was voided", () => {
    expect(saleConfirmationState(appt, programs, [{ id: "b1", appointment_id: "a1", lead_id: "l1", agent_payment_status: "voided" }])).toEqual({ kind: "confirmable" });
  });
  it("refuses cancelled/replaced/no-show appointments and appointments with no credited agent", () => {
    for (const status of ["Cancelled", "Replaced", "No-show"]) expect(saleConfirmationState({ ...appt, status }, programs, []).kind).toBe("ineligible");
    expect(saleConfirmationState({ ...appt, booking_agent_id: null }, programs, []).kind).toBe("ineligible");
  });
});

describe("formatBonusAmount", () => {
  it("shows Canadian dollars", () => {
    expect(formatBonusAmount(50)).toBe("CA$50.00");
    expect(formatBonusAmount("50.00", "CAD")).toBe("CA$50.00");
  });
});
