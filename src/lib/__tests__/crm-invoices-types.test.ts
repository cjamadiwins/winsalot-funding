import { describe, expect, it } from "vitest";
import { canPermanentlyDeleteInvoice, effectiveInvoiceStatus, isInvoiceOverdue } from "../crm-invoices-types";

describe("canPermanentlyDeleteInvoice", () => {
  const base = { status: "Draft" as const, amount_paid: 0, first_sent_at: null, last_sent_at: null, last_reminder_at: null };

  it("allows deleting a pristine Draft", () => {
    expect(canPermanentlyDeleteInvoice(base)).toBe(true);
  });

  it("blocks deleting a non-Draft invoice", () => {
    expect(canPermanentlyDeleteInvoice({ ...base, status: "Sent" })).toBe(false);
  });

  it("blocks deleting a Draft that has ever been sent", () => {
    expect(canPermanentlyDeleteInvoice({ ...base, first_sent_at: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(canPermanentlyDeleteInvoice({ ...base, last_sent_at: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(canPermanentlyDeleteInvoice({ ...base, last_reminder_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });

  it("blocks deleting a Draft that has any payment recorded", () => {
    expect(canPermanentlyDeleteInvoice({ ...base, amount_paid: 50 })).toBe(false);
  });
});

describe("isInvoiceOverdue", () => {
  it("is never overdue for Draft, Paid, Cancelled, or Archived invoices", () => {
    const pastDue = "2000-01-01";
    for (const status of ["Draft", "Paid", "Cancelled", "Archived"] as const) {
      expect(isInvoiceOverdue({ status, due_date: pastDue })).toBe(false);
    }
  });

  it("is not overdue when there is no due date", () => {
    expect(isInvoiceOverdue({ status: "Sent", due_date: null })).toBe(false);
  });

  it("is overdue for a Sent invoice whose due date has passed", () => {
    expect(isInvoiceOverdue({ status: "Sent", due_date: "2000-01-01" })).toBe(true);
  });

  it("is not overdue for a Sent invoice due in the future", () => {
    expect(isInvoiceOverdue({ status: "Sent", due_date: "2999-01-01" })).toBe(false);
  });

  it("applies the same rule to Partially Paid invoices", () => {
    expect(isInvoiceOverdue({ status: "Partially Paid", due_date: "2000-01-01" })).toBe(true);
  });
});

describe("effectiveInvoiceStatus", () => {
  it("reports Overdue for a past-due Sent invoice", () => {
    expect(effectiveInvoiceStatus({ status: "Sent", due_date: "2000-01-01" })).toBe("Overdue");
  });

  it("reports the stored status otherwise", () => {
    expect(effectiveInvoiceStatus({ status: "Paid", due_date: "2000-01-01" })).toBe("Paid");
    expect(effectiveInvoiceStatus({ status: "Draft", due_date: null })).toBe("Draft");
  });
});
