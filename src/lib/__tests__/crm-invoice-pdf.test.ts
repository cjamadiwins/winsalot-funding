import { describe, expect, it } from "vitest";
import { renderInvoicePdfBuffer } from "../crm-invoice-pdf";
import type { CrmInvoiceRow, CrmInvoiceLineItemRow } from "../crm-invoices-types";

const invoice = {
  id: "inv-1",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  created_by: null,
  updated_by: null,
  client_id: "client-1",
  invoice_number: "INV-2026-0042",
  billing_contact_name: "Jane Doe",
  billing_address: "123 Main St",
  issue_date: "2026-08-01",
  due_date: "2026-08-31",
  service_period_start: "2026-08-01",
  service_period_end: "2026-08-31",
  currency: "USD",
  tax_rate: 13,
  discount_amount: 0,
  subtotal: 600,
  tax_amount: 78,
  total: 678,
  amount_paid: 0,
  balance: 678,
  status: "Sent",
  payment_instructions: "E-Transfer to billing@winsalotcorp.com",
  admin_notes: null,
  client_facing_notes: "Thank you!",
  first_sent_at: "2026-08-01T00:00:00Z",
  last_sent_at: "2026-08-01T00:00:00Z",
  last_reminder_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  archived_at: null,
  is_free_invoice: false,
} as unknown as CrmInvoiceRow;

const lineItems: CrmInvoiceLineItemRow[] = [
  { id: "li-1", created_at: "2026-08-01T00:00:00Z", invoice_id: "inv-1", description: "Lead generation - August", quantity: 1, unit_price: 600, line_total: 600, sort_order: 0 },
];

describe("renderInvoicePdfBuffer", () => {
  it("produces a real, non-empty PDF document", async () => {
    const buffer = await renderInvoicePdfBuffer({ invoice, clientCompanyName: "Brent's Essentials", lineItems });
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
