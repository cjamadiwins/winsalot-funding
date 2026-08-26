import { describe, expect, it } from "vitest";
import {
  buildDefaultInvoiceReceiptMessage,
  buildDefaultInvoiceReminderMessage,
  buildDefaultInvoiceSentMessage,
  defaultInvoiceReceiptSubject,
  defaultInvoiceReminderSubject,
  DEFAULT_INVOICE_SENT_SUBJECT,
  renderInvoiceEmailBody,
} from "../crm-invoice-emails";

const baseInvoice = {
  invoice_number: "INV-2026-0007",
  service_period_start: "2026-08-01",
  service_period_end: "2026-08-31",
  balance: 750,
  total: 750,
  amount_paid: 0,
  currency: "USD",
  due_date: "2026-09-15",
  payment_instructions: "E-Transfer to billing@winsalotcorp.com",
};

describe("buildDefaultInvoiceSentMessage - exact default monthly invoice template", () => {
  const message = buildDefaultInvoiceSentMessage(baseInvoice, "Brent's Essentials");

  it("uses the exact required subject", () => {
    expect(DEFAULT_INVOICE_SENT_SUBJECT).toBe("Your Monthly Invoice from Winsalot Corp");
  });

  it("replaces every bracketed field with real data", () => {
    expect(message).toContain("Hi Brent's Essentials,");
    expect(message).toContain("Invoice number: INV-2026-0007");
    expect(message).toContain("Invoice period: August 1, 2026 - August 31, 2026");
    expect(message).toContain("Amount due: $750.00");
    expect(message).toContain("Due date: September 15, 2026");
  });

  it("keeps the required Winsalot Billing signature block", () => {
    expect(message).toContain("Best regards,");
    expect(message).toContain("Winsalot Billing");
    expect(message).toContain("Winsalot Corp");
    expect(message).toContain("Empowering Businesses, One Solution at a Time.");
    expect(message).toContain("info@winsalotcorp.com");
    expect(message).toContain("647-300-1270");
    expect(message).toContain("winsalotcorp.com");
  });

  it("uses the invoice's remaining balance (not the total) as 'Amount due'", () => {
    const partiallyPaid = { ...baseInvoice, amount_paid: 250, balance: 500 };
    const partialMessage = buildDefaultInvoiceSentMessage(partiallyPaid, "Mantra Collab");
    expect(partialMessage).toContain("Amount due: $500.00");
  });
});

describe("buildDefaultInvoiceReminderMessage", () => {
  const message = buildDefaultInvoiceReminderMessage({ ...baseInvoice, amount_paid: 200, balance: 550 }, "Brent's Essentials");

  it("shows client name, invoice number, original due date, total, amount paid, outstanding balance, and payment instructions", () => {
    expect(message).toContain("Hi Brent's Essentials,");
    expect(message).toContain("Invoice number: INV-2026-0007");
    expect(message).toContain("Original due date: September 15, 2026");
    expect(message).toContain("Total: $750.00");
    expect(message).toContain("Amount paid: $200.00");
    expect(message).toContain("Outstanding balance: $550.00");
    expect(message).toContain("Payment Instructions:");
    expect(message).toContain("E-Transfer to billing@winsalotcorp.com");
  });

  it("subject names the exact invoice", () => {
    expect(defaultInvoiceReminderSubject("INV-2026-0007")).toBe("Payment Reminder: Invoice INV-2026-0007 from Winsalot Corp");
  });
});

describe("buildDefaultInvoiceReceiptMessage", () => {
  const payment = { amount: 750, currency: "USD", payment_date: "2026-08-20", payment_method: "e_transfer" as const, reference_number: "REF-123" };

  it("shows invoice number, amount paid, payment date, method, reference, and a zero remaining balance when paid in full", () => {
    const message = buildDefaultInvoiceReceiptMessage({ ...baseInvoice, balance: 0 }, "Brent's Essentials", payment);
    expect(message).toContain("Invoice number: INV-2026-0007");
    expect(message).toContain("Amount paid: $750.00");
    expect(message).toContain("Payment date: August 20, 2026");
    expect(message).toContain("Payment method: E-Transfer");
    expect(message).toContain("Payment reference: REF-123");
    expect(message).toContain("(paid in full)");
  });

  it("shows the real remaining balance for a partial payment", () => {
    const message = buildDefaultInvoiceReceiptMessage({ ...baseInvoice, balance: 250 }, "Mantra Collab", { ...payment, amount: 500 });
    expect(message).toContain("Remaining balance: $250.00");
    expect(message).not.toContain("paid in full");
  });

  it("subject names the exact invoice", () => {
    expect(defaultInvoiceReceiptSubject("INV-2026-0007")).toBe("Payment Receipt: Invoice INV-2026-0007 from Winsalot Corp");
  });
});

describe("renderInvoiceEmailBody", () => {
  it("preserves the admin's exact edited subject and message text", () => {
    const body = renderInvoiceEmailBody("A custom subject", "Hi there,\n\nCustom message.");
    expect(body.subject).toBe("A custom subject");
    expect(body.text).toBe("Hi there,\n\nCustom message.");
    expect(body.html).toContain("A custom subject");
    expect(body.html).toContain("Custom message.");
  });
});

describe("resending never fabricates a different invoice number", () => {
  it("the sent and reminder templates for the same invoice always reference the identical invoice_number", () => {
    const sentMessage = buildDefaultInvoiceSentMessage(baseInvoice, "Brent's Essentials");
    const reminderMessage = buildDefaultInvoiceReminderMessage(baseInvoice, "Brent's Essentials");
    expect(sentMessage).toContain(baseInvoice.invoice_number);
    expect(reminderMessage).toContain(baseInvoice.invoice_number);
    // Neither builder takes or produces a new invoice_number - both only
    // ever echo back the exact one on the row passed in, which is the
    // structural guarantee that a resend/reminder can never diverge onto
    // a different invoice (the real "no duplicate" guarantee lives in
    // send-crm-invoice-email.ts, which never inserts a crm_invoices row).
  });
});
