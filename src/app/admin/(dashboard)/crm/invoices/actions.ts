"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchInvoiceDetail } from "@/lib/crm-invoices-data";
import { canPermanentlyDeleteInvoice, invoiceNeedsFreeConfirmation, type CrmInvoiceRow, type InvoiceAuditAction } from "@/lib/crm-invoices-types";
import {
  buildDefaultInvoiceReceiptMessage,
  buildDefaultInvoiceReminderMessage,
  buildDefaultInvoiceSentMessage,
  defaultInvoiceReceiptSubject,
  defaultInvoiceReminderSubject,
  defaultInvoiceSentSubject,
} from "@/lib/crm-invoice-emails";
import { sendCrmInvoiceEmail, type CrmInvoiceEmailType } from "@/lib/send-crm-invoice-email";
import type { CrmUserRow } from "@/lib/crm-types";
import { isClientCurrency, type CrmPaymentRow } from "@/lib/crm-clients-types";

type ActionResult = { error?: string; invoiceId?: string };

function performedByName(admin: CrmUserRow): string {
  return admin.full_name || admin.email;
}

function parseOptionalText(raw: FormDataEntryValue | null): string | null {
  const str = String(raw ?? "").trim();
  return str || null;
}

async function recordInvoiceAudit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  invoice: Pick<CrmInvoiceRow, "id" | "client_id" | "invoice_number">,
  action: InvoiceAuditAction,
  performedByNameValue: string,
  details?: string
) {
  await supabase.from("crm_invoice_audit").insert({
    invoice_id: invoice.id,
    client_id: invoice.client_id,
    invoice_number: invoice.invoice_number,
    action,
    details: details ?? null,
    performed_by_name: performedByNameValue,
  });
}

async function logInvoiceActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  invoice: Pick<CrmInvoiceRow, "id" | "client_id">,
  admin: CrmUserRow,
  activityType: string,
  notes: string
) {
  await supabase.from("crm_activities").insert({
    client_id: invoice.client_id,
    invoice_id: invoice.id,
    agent_id: admin.id,
    activity_type: activityType,
    notes,
  });
}

export type LineItemInput = { description: string; quantity: number; unit_price: number };

function parseLineItems(raw: FormDataEntryValue | null): { items: LineItemInput[]; error?: string } {
  const str = String(raw ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return { items: [], error: "Invalid line items." };
  }
  if (!Array.isArray(parsed)) return { items: [], error: "Invalid line items." };

  const items: LineItemInput[] = [];
  for (const raw of parsed) {
    const item = raw as Record<string, unknown>;
    const description = String(item.description ?? "").trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    if (!description) return { items: [], error: "Every line item needs a description." };
    if (!Number.isFinite(quantity) || quantity < 0) return { items: [], error: "Line item quantity must be zero or greater." };
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { items: [], error: "Line item rate must be zero or greater." };
    items.push({ description, quantity, unit_price: unitPrice });
  }
  return { items };
}

// "Create" + "Save as draft" are the same action - every invoice starts
// as a Draft (the table default) regardless of how it's created; only
// sendInvoiceAction ever transitions it out of Draft.
export async function createInvoiceAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!clientId) return { error: "Select a client for this invoice." };

  const { data: client } = await supabase.from("crm_clients").select("id, company_name, email, billing_address, currency").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Client not found." };

  const { items, error: lineItemsError } = parseLineItems(formData.get("line_items"));
  if (lineItemsError) return { error: lineItemsError };
  if (items.length === 0) return { error: "An invoice needs at least one line item with a description, quantity, and rate." };

  const taxRate = Number(formData.get("tax_rate") ?? 0) || 0;
  const discountAmount = Number(formData.get("discount_amount") ?? 0) || 0;
  if (taxRate < 0) return { error: "Tax rate cannot be negative." };
  if (discountAmount < 0) return { error: "Discount cannot be negative." };

  // "Never generate a $0.00 invoice when valid line-item values were
  // entered" - if the submitted line items sum to nothing, that's either
  // a mistake (a description with no quantity/rate) or a deliberate
  // complimentary invoice; either way the admin must say which.
  const isFreeInvoice = formData.get("is_free_invoice") === "on";
  if (invoiceNeedsFreeConfirmation(items, isFreeInvoice)) {
    return { error: 'This invoice totals $0.00. Enter a valid quantity and rate for each line item, or check "This is a free invoice" to confirm no payment is expected.' };
  }

  // Defaults to (and, per the brief, should normally just be) the
  // client's own saved currency - never silently falls back to USD if
  // that's not actually the client's currency.
  const currency = parseOptionalText(formData.get("currency")) ?? client.currency;
  if (!isClientCurrency(currency)) return { error: "Select a valid currency (CAD or USD)." };

  const { data: invoice, error } = await supabase
    .from("crm_invoices")
    .insert({
      created_by: admin.id,
      client_id: clientId,
      status: "Draft",
      billing_contact_name: parseOptionalText(formData.get("billing_contact_name")),
      billing_address: parseOptionalText(formData.get("billing_address")) ?? client.billing_address,
      issue_date: parseOptionalText(formData.get("issue_date")) ?? new Date().toISOString().slice(0, 10),
      due_date: parseOptionalText(formData.get("due_date")),
      service_period_start: parseOptionalText(formData.get("service_period_start")),
      service_period_end: parseOptionalText(formData.get("service_period_end")),
      currency,
      tax_rate: taxRate,
      discount_amount: discountAmount,
      is_free_invoice: isFreeInvoice,
      payment_instructions: parseOptionalText(formData.get("payment_instructions")),
      admin_notes: parseOptionalText(formData.get("admin_notes")),
      client_facing_notes: parseOptionalText(formData.get("client_facing_notes")),
    })
    .select("*")
    .single();
  if (error || !invoice) return { error: `Failed to create this invoice: ${error?.message ?? "Unknown error."}` };

  const { error: lineItemInsertError } = await supabase.from("crm_invoice_line_items").insert(
    items.map((item, index) => ({ invoice_id: invoice.id, description: item.description, quantity: item.quantity, unit_price: item.unit_price, sort_order: index }))
  );
  if (lineItemInsertError) return { error: `Invoice created, but failed to save line items: ${lineItemInsertError.message}` };

  await recordInvoiceAudit(supabase, invoice, "created", performedByName(admin));
  await logInvoiceActivity(supabase, invoice, admin, "invoice_created", `Invoice ${invoice.invoice_number} created by ${performedByName(admin)}.`);

  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${clientId}`);
  return { invoiceId: invoice.id };
}

// "Edit" - rewrites the invoice's own fields plus its full line-item set
// in one call. Blocked once an invoice is Cancelled or Archived (those
// are meant to be final states); every other status remains editable,
// same as the brief's "edit" capability with no stated status
// restriction beyond that.
export async function updateInvoiceAction(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!existing) return { error: "Invoice not found." };
  if (existing.status === "Cancelled" || existing.status === "Archived") {
    return { error: `This invoice is ${existing.status} and can no longer be edited.` };
  }

  const { items, error: lineItemsError } = parseLineItems(formData.get("line_items"));
  if (lineItemsError) return { error: lineItemsError };
  if (items.length === 0) return { error: "An invoice needs at least one line item." };

  const taxRate = Number(formData.get("tax_rate") ?? 0) || 0;
  const discountAmount = Number(formData.get("discount_amount") ?? 0) || 0;
  if (taxRate < 0) return { error: "Tax rate cannot be negative." };
  if (discountAmount < 0) return { error: "Discount cannot be negative." };

  const isFreeInvoice = formData.get("is_free_invoice") === "on";
  if (invoiceNeedsFreeConfirmation(items, isFreeInvoice)) {
    return { error: 'This invoice totals $0.00. Enter a valid quantity and rate for each line item, or check "This is a free invoice" to confirm no payment is expected.' };
  }

  const currency = parseOptionalText(formData.get("currency")) ?? existing.currency;
  if (!isClientCurrency(currency)) return { error: "Select a valid currency (CAD or USD)." };

  const { error: updateError } = await supabase
    .from("crm_invoices")
    .update({
      updated_by: admin.id,
      billing_contact_name: parseOptionalText(formData.get("billing_contact_name")),
      billing_address: parseOptionalText(formData.get("billing_address")),
      issue_date: parseOptionalText(formData.get("issue_date")) ?? existing.issue_date,
      due_date: parseOptionalText(formData.get("due_date")),
      service_period_start: parseOptionalText(formData.get("service_period_start")),
      service_period_end: parseOptionalText(formData.get("service_period_end")),
      currency,
      tax_rate: taxRate,
      discount_amount: discountAmount,
      is_free_invoice: isFreeInvoice,
      payment_instructions: parseOptionalText(formData.get("payment_instructions")),
      admin_notes: parseOptionalText(formData.get("admin_notes")),
      client_facing_notes: parseOptionalText(formData.get("client_facing_notes")),
    })
    .eq("id", invoiceId);
  if (updateError) return { error: `Failed to save changes: ${updateError.message}` };

  // Full replace: delete then insert. The AFTER trigger on
  // crm_invoice_line_items recalculates crm_invoices.subtotal from
  // whatever ends up in the table, so this always leaves subtotal
  // correct regardless of how many rows changed.
  const { error: deleteError } = await supabase.from("crm_invoice_line_items").delete().eq("invoice_id", invoiceId);
  if (deleteError) return { error: `Failed to update line items: ${deleteError.message}` };
  const { error: insertError } = await supabase
    .from("crm_invoice_line_items")
    .insert(items.map((item, index) => ({ invoice_id: invoiceId, description: item.description, quantity: item.quantity, unit_price: item.unit_price, sort_order: index })));
  if (insertError) return { error: `Failed to update line items: ${insertError.message}` };

  await recordInvoiceAudit(supabase, existing, "edited", performedByName(admin));
  await logInvoiceActivity(supabase, existing, admin, "note", `Invoice ${existing.invoice_number} edited by ${performedByName(admin)}.`);

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${existing.client_id}`);
  return { invoiceId };
}

// "Duplicate" - a brand-new Draft invoice (its own fresh invoice_number
// via next_crm_invoice_number()'s column default) with the same client,
// fields, and line items, but none of the original's sent/payment/
// audit history - exactly what "must not create a duplicate invoice"
// (about resend/reminder) implicitly contrasts with: duplicating is a
// deliberate, explicit new invoice, unlike a resend.
export async function duplicateInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: detail, error } = await fetchInvoiceDetail(supabase, invoiceId);
  if (error || !detail) return { error: error ?? "Invoice not found." };

  const { invoice } = detail;
  const { data: newInvoice, error: insertError } = await supabase
    .from("crm_invoices")
    .insert({
      created_by: admin.id,
      client_id: invoice.client_id,
      billing_contact_name: invoice.billing_contact_name,
      billing_address: invoice.billing_address,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: invoice.due_date,
      service_period_start: invoice.service_period_start,
      service_period_end: invoice.service_period_end,
      currency: invoice.currency,
      tax_rate: invoice.tax_rate,
      discount_amount: invoice.discount_amount,
      is_free_invoice: invoice.is_free_invoice,
      payment_instructions: invoice.payment_instructions,
      admin_notes: invoice.admin_notes,
      client_facing_notes: invoice.client_facing_notes,
    })
    .select("*")
    .single();
  if (insertError || !newInvoice) return { error: `Failed to duplicate this invoice: ${insertError?.message ?? "Unknown error."}` };

  if (detail.lineItems.length > 0) {
    await supabase.from("crm_invoice_line_items").insert(
      detail.lineItems.map((item, index) => ({
        invoice_id: newInvoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        sort_order: index,
      }))
    );
  }

  await recordInvoiceAudit(supabase, newInvoice, "duplicated", performedByName(admin), `Duplicated from ${invoice.invoice_number}.`);
  await logInvoiceActivity(supabase, newInvoice, admin, "invoice_created", `Invoice ${newInvoice.invoice_number} created by ${performedByName(admin)} (duplicated from ${invoice.invoice_number}).`);

  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId: newInvoice.id };
}

export type InvoiceEmailPreview = { to: string; subject: string; message: string };

function invoiceClientDisplayName(invoice: Pick<CrmInvoiceRow, "billing_contact_name">, clientCompanyName: string): string {
  return invoice.billing_contact_name || clientCompanyName;
}

// Powers the "preview and edit the recipient, subject and email message"
// requirement - returns the *default* recipient/subject/message for this
// email type, without sending anything. The admin edits any of the
// three in the UI, then sendInvoiceAction/sendInvoiceReceiptAction below
// receive whatever the admin ends up with (default or edited) and send
// exactly that - this function never re-runs at send time, so the
// preview and the real send can never disagree.
export async function previewInvoiceEmailAction(invoiceId: string, emailType: CrmInvoiceEmailType): Promise<{ preview?: InvoiceEmailPreview; error?: string }> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice, error } = await supabase.from("crm_invoices").select("*, crm_clients(company_name, email)").eq("id", invoiceId).maybeSingle();
  if (error || !invoice) return { error: "Invoice not found." };
  const client = (invoice as unknown as { crm_clients: { company_name: string; email: string | null } }).crm_clients;
  if (!client?.email) return { error: "This client has no email address on file. Add one before sending." };

  const displayName = invoiceClientDisplayName(invoice, client.company_name);

  if (emailType === "invoice_receipt") {
    const { data: payment } = await supabase
      .from("crm_payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .is("reversed_at", null)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!payment) return { error: "This invoice has no recorded payment to send a receipt for." };
    return {
      preview: {
        to: client.email,
        subject: defaultInvoiceReceiptSubject(invoice.invoice_number),
        message: buildDefaultInvoiceReceiptMessage(invoice as CrmInvoiceRow, displayName, payment as CrmPaymentRow),
      },
    };
  }

  const subject = emailType === "invoice_sent" ? defaultInvoiceSentSubject(invoice.invoice_number) : defaultInvoiceReminderSubject(invoice.invoice_number);
  const message =
    emailType === "invoice_sent"
      ? buildDefaultInvoiceSentMessage(invoice as CrmInvoiceRow, displayName)
      : buildDefaultInvoiceReminderMessage(invoice as CrmInvoiceRow, displayName);

  return { preview: { to: client.email, subject, message } };
}

// The single send/resend/reminder entry point. `confirmed` must be true
// for the very first send of a given invoice - "every first send must
// require deliberate admin confirmation" - re-checked here regardless
// of what the confirmation modal already required client-side. A resend
// or reminder never creates a new invoice or a new invoice_number; both
// operate on this exact row (see sendCrmInvoiceEmail's own comment).
// `to`/`subject`/`message` are whatever the admin ended up with in the
// preview step (the default, or their own edit) - never rebuilt here.
export async function sendInvoiceAction(
  invoiceId: string,
  emailType: "invoice_sent" | "invoice_reminder",
  confirmed: boolean,
  to: string,
  subject: string,
  message: string
): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const trimmedTo = to.trim();
  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  if (!trimmedTo || !trimmedSubject || !trimmedMessage) {
    return { error: "Recipient, subject, and message are all required." };
  }

  const { data: invoice, error } = await supabase.from("crm_invoices").select("*, crm_clients(company_name, email)").eq("id", invoiceId).maybeSingle();
  if (error || !invoice) return { error: "Invoice not found." };
  if (invoice.status === "Cancelled" || invoice.status === "Archived") {
    return { error: `This invoice is ${invoice.status} and cannot be emailed.` };
  }
  if (!invoice.is_free_invoice && Number(invoice.subtotal) <= 0) {
    return { error: 'This invoice totals $0.00 and cannot be sent. Edit it to add valid line items, or mark it as a free invoice.' };
  }

  const client = (invoice as unknown as { crm_clients: { company_name: string; email: string | null } }).crm_clients;

  const isFirstSend = emailType === "invoice_sent" && !invoice.first_sent_at;
  if (isFirstSend && !confirmed) {
    return { error: "Sending this invoice for the first time requires deliberate confirmation." };
  }

  const { data: lineItems } = await supabase.from("crm_invoice_line_items").select("*").eq("invoice_id", invoiceId).order("sort_order");

  try {
    await sendCrmInvoiceEmail({
      supabase,
      invoice: invoice as CrmInvoiceRow,
      clientCompanyName: client?.company_name ?? "Client",
      toEmail: trimmedTo,
      subject: trimmedSubject,
      message: trimmedMessage,
      lineItems: lineItems ?? [],
      emailType,
      admin,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the invoice email." };
  }

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId };
}

// "Optionally email a payment receipt" - allowed any time the invoice
// has at least one non-reversed payment (typically once it's Paid, but
// not restricted to that status, since a partial payment can also
// warrant a receipt for the amount actually collected so far).
export async function sendInvoiceReceiptAction(invoiceId: string, to: string, subject: string, message: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const trimmedTo = to.trim();
  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  if (!trimmedTo || !trimmedSubject || !trimmedMessage) {
    return { error: "Recipient, subject, and message are all required." };
  }

  const { data: invoice, error } = await supabase.from("crm_invoices").select("*, crm_clients(company_name, email)").eq("id", invoiceId).maybeSingle();
  if (error || !invoice) return { error: "Invoice not found." };

  const { count: paymentCount } = await supabase
    .from("crm_payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId)
    .is("reversed_at", null);
  if (!paymentCount) return { error: "This invoice has no recorded payment to send a receipt for." };

  const client = (invoice as unknown as { crm_clients: { company_name: string; email: string | null } }).crm_clients;

  const { data: lineItems } = await supabase.from("crm_invoice_line_items").select("*").eq("invoice_id", invoiceId).order("sort_order");

  try {
    await sendCrmInvoiceEmail({
      supabase,
      invoice: invoice as CrmInvoiceRow,
      clientCompanyName: client?.company_name ?? "Client",
      toEmail: trimmedTo,
      subject: trimmedSubject,
      message: trimmedMessage,
      lineItems: lineItems ?? [],
      emailType: "invoice_receipt",
      admin,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send the payment receipt." };
  }

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  return { invoiceId };
}

export async function recordInvoicePaymentAction(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "Draft") return { error: "This invoice is still a Draft - send it before recording a payment." };
  if (invoice.status === "Cancelled" || invoice.status === "Archived") return { error: `This invoice is ${invoice.status} and cannot accept payments.` };

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid payment amount greater than zero." };
  const paymentDate = String(formData.get("payment_date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const paymentMethod = parseOptionalText(formData.get("payment_method"));
  const referenceNumber = parseOptionalText(formData.get("reference_number"));
  const notes = parseOptionalText(formData.get("notes"));

  const { error } = await supabase.from("crm_payments").insert({
    invoice_id: invoiceId,
    client_id: invoice.client_id,
    payment_date: paymentDate,
    amount,
    currency: invoice.currency,
    payment_method: paymentMethod,
    reference_number: referenceNumber,
    notes,
    recorded_by: admin.id,
    recorded_by_name: performedByName(admin),
  });
  if (error) return { error: `Failed to record this payment: ${error.message}` };

  await recordInvoiceAudit(supabase, invoice, "payment_recorded", performedByName(admin), `${invoice.currency} ${amount.toFixed(2)} recorded.`);
  await logInvoiceActivity(supabase, invoice, admin, "payment_recorded", `Payment of ${invoice.currency} ${amount.toFixed(2)} recorded against invoice ${invoice.invoice_number} by ${performedByName(admin)}.`);

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId };
}

export async function reverseInvoicePaymentAction(invoiceId: string, paymentId: string, reason: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "A reason is required to reverse a payment." };

  const { error } = await supabase
    .from("crm_payments")
    .update({ reversed_at: new Date().toISOString(), reversed_by: admin.id, reversal_reason: trimmedReason })
    .eq("id", paymentId)
    .eq("invoice_id", invoiceId)
    .is("reversed_at", null);
  if (error) return { error: `Failed to reverse this payment: ${error.message}` };

  await recordInvoiceAudit(supabase, invoice, "payment_reversed", performedByName(admin), trimmedReason);
  await logInvoiceActivity(supabase, invoice, admin, "payment_reversed", `A payment on invoice ${invoice.invoice_number} was reversed by ${performedByName(admin)}: ${trimmedReason}`);

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId };
}

// Manual "Mark as Paid" - inserts a payment row for exactly the
// remaining balance rather than faking the status column directly, so
// amount_paid/balance (and the Paid status itself, set by the
// crm_payments trigger) never drift out of sync with what the ledger
// actually shows was collected.
export async function markInvoicePaidAction(invoiceId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "Draft" || invoice.status === "Cancelled" || invoice.status === "Archived") {
    return { error: `This invoice is ${invoice.status} and cannot be marked paid.` };
  }
  const remaining = Number(invoice.balance);
  if (remaining <= 0) return { error: "This invoice has no remaining balance." };

  const { error } = await supabase.from("crm_payments").insert({
    invoice_id: invoiceId,
    client_id: invoice.client_id,
    payment_date: new Date().toISOString().slice(0, 10),
    amount: remaining,
    currency: invoice.currency,
    payment_method: "other",
    notes: `Manually marked as paid by ${performedByName(admin)}.`,
    recorded_by: admin.id,
    recorded_by_name: performedByName(admin),
  });
  if (error) return { error: `Failed to mark this invoice paid: ${error.message}` };

  await recordInvoiceAudit(supabase, invoice, "marked_paid", performedByName(admin));

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId };
}

export async function markInvoicePartiallyPaidAction(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "Draft" || invoice.status === "Cancelled" || invoice.status === "Archived") {
    return { error: `This invoice is ${invoice.status} and cannot be marked partially paid.` };
  }

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount greater than zero." };
  if (amount >= Number(invoice.balance)) return { error: "Use Mark as Paid instead - this amount covers the full remaining balance." };

  const { error } = await supabase.from("crm_payments").insert({
    invoice_id: invoiceId,
    client_id: invoice.client_id,
    payment_date: new Date().toISOString().slice(0, 10),
    amount,
    currency: invoice.currency,
    payment_method: "other",
    notes: `Manually marked as partially paid by ${performedByName(admin)}.`,
    recorded_by: admin.id,
    recorded_by_name: performedByName(admin),
  });
  if (error) return { error: `Failed to mark this invoice partially paid: ${error.message}` };

  await recordInvoiceAudit(supabase, invoice, "marked_partially_paid", performedByName(admin), `${invoice.currency} ${amount.toFixed(2)}`);

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId };
}

export async function cancelInvoiceAction(invoiceId: string, reason: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "Paid" || invoice.status === "Cancelled" || invoice.status === "Archived") {
    return { error: `This invoice is ${invoice.status} and cannot be cancelled.` };
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "A reason is required to cancel an invoice." };

  const { error } = await supabase
    .from("crm_invoices")
    .update({ status: "Cancelled", cancelled_at: new Date().toISOString(), cancelled_by: admin.id, cancel_reason: trimmedReason })
    .eq("id", invoiceId);
  if (error) return { error: `Failed to cancel this invoice: ${error.message}` };

  await recordInvoiceAudit(supabase, invoice, "cancelled", performedByName(admin), trimmedReason);
  await logInvoiceActivity(supabase, invoice, admin, "invoice_cancelled", `Invoice ${invoice.invoice_number} cancelled by ${performedByName(admin)}: ${trimmedReason}`);

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId };
}

export async function archiveInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "Archived") return { error: "This invoice is already archived." };

  const { error } = await supabase.from("crm_invoices").update({ status: "Archived", archived_at: new Date().toISOString() }).eq("id", invoiceId);
  if (error) return { error: `Failed to archive this invoice: ${error.message}` };

  await recordInvoiceAudit(supabase, invoice, "archived", performedByName(admin));
  await logInvoiceActivity(supabase, invoice, admin, "invoice_archived", `Invoice ${invoice.invoice_number} archived by ${performedByName(admin)}.`);

  revalidatePath(`/admin/crm/invoices/${invoiceId}`);
  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${invoice.client_id}`);
  return { invoiceId };
}

// "Only allow permanent deletion of an invoice when it is still a Draft
// and has no payment, sending, or activity history" - re-checked here
// on the server per canPermanentlyDeleteInvoice(), regardless of what
// the confirmation UI already showed.
export async function deleteInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase.from("crm_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  if (!canPermanentlyDeleteInvoice(invoice)) {
    return { error: "Only a Draft invoice with no payment, sending, or activity history can be permanently deleted. Cancel or archive it instead." };
  }

  const clientId = invoice.client_id;
  await recordInvoiceAudit(supabase, invoice, "deleted", performedByName(admin), `Invoice ${invoice.invoice_number} permanently deleted.`);

  const { error } = await supabase.from("crm_invoices").delete().eq("id", invoiceId);
  if (error) return { error: `Failed to delete this invoice: ${error.message}` };

  revalidatePath("/admin/crm/invoices");
  revalidatePath(`/admin/crm/clients/${clientId}`);
  return {};
}
