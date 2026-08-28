import { describe, expect, it } from "vitest";
import {
  canPermanentlyDeleteInvoice,
  canPermanentlyDeleteTestInvoice,
  computeInvoiceSubtotal,
  effectiveInvoiceStatus,
  invoiceNeedsFreeConfirmation,
  isInvoiceOverdue,
} from "../crm-invoices-types";

describe("canPermanentlyDeleteInvoice", () => {
  const base = { status: "Draft" as const, amount_paid: 0 };

  it("allows deleting a pristine Draft", () => {
    expect(canPermanentlyDeleteInvoice(base)).toBe(true);
  });

  it("allows deleting a Cancelled invoice with no payment history", () => {
    expect(canPermanentlyDeleteInvoice({ ...base, status: "Cancelled" })).toBe(true);
  });

  it("blocks deleting Sent, Partially Paid, and Paid invoices - they are financial records", () => {
    expect(canPermanentlyDeleteInvoice({ ...base, status: "Sent" })).toBe(false);
    expect(canPermanentlyDeleteInvoice({ ...base, status: "Partially Paid" })).toBe(false);
    expect(canPermanentlyDeleteInvoice({ ...base, status: "Paid" })).toBe(false);
  });

  it("blocks deleting an Archived invoice", () => {
    expect(canPermanentlyDeleteInvoice({ ...base, status: "Archived" })).toBe(false);
  });

  it("blocks deleting a Draft or Cancelled invoice that has any payment recorded", () => {
    expect(canPermanentlyDeleteInvoice({ ...base, amount_paid: 50 })).toBe(false);
    expect(canPermanentlyDeleteInvoice({ ...base, status: "Cancelled", amount_paid: 50 })).toBe(false);
  });
});

describe("canPermanentlyDeleteTestInvoice", () => {
  it("allows deleting an invoice flagged as test data", () => {
    expect(canPermanentlyDeleteTestInvoice({ is_test_data: true })).toBe(true);
  });

  it("never allows deleting a real (non-test) invoice through this path", () => {
    expect(canPermanentlyDeleteTestInvoice({ is_test_data: false })).toBe(false);
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

describe("computeInvoiceSubtotal", () => {
  it("matches the reported bug's exact scenario: Lead Gen, qty 1, rate CAD $750", () => {
    expect(computeInvoiceSubtotal([{ quantity: 1, unit_price: 750 }])).toBe(750);
  });

  it("sums quantity * unit_price across every line item", () => {
    expect(
      computeInvoiceSubtotal([
        { quantity: 2, unit_price: 100 },
        { quantity: 1, unit_price: 50 },
      ])
    ).toBe(250);
  });

  it("is 0 for no line items", () => {
    expect(computeInvoiceSubtotal([])).toBe(0);
  });
});

describe("invoiceNeedsFreeConfirmation", () => {
  it("does not require confirmation for a valid, non-zero line item", () => {
    expect(invoiceNeedsFreeConfirmation([{ quantity: 1, unit_price: 750 }], false)).toBe(false);
  });

  it("requires confirmation when there are no line items and it isn't marked free", () => {
    expect(invoiceNeedsFreeConfirmation([], false)).toBe(true);
  });

  it("requires confirmation when every line item is $0 and it isn't marked free", () => {
    expect(invoiceNeedsFreeConfirmation([{ quantity: 1, unit_price: 0 }], false)).toBe(true);
  });

  it("never requires confirmation once the invoice is marked free, even at $0", () => {
    expect(invoiceNeedsFreeConfirmation([], true)).toBe(false);
    expect(invoiceNeedsFreeConfirmation([{ quantity: 1, unit_price: 0 }], true)).toBe(false);
  });
});
