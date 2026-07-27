"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncOverdueInvoices, uploadPaymentReceipt } from "@/lib/provider-invoices";
import { formatCad, PAYMENT_METHODS, type PaymentMethod, type ProviderInvoiceRow, type ProviderPaymentRow } from "@/lib/provider-invoice-types";

type ActionResult = { error?: string; requiresOverpayConfirmation?: boolean; invoiceId?: string };

type LineItemInput = { description: string; quantity: number; unit_price: number };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function parseLineItems(formData: FormData): { items: LineItemInput[]; error?: string } {
  const raw = String(formData.get("line_items") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { items: [], error: "Invalid line items." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { items: [], error: "Add at least one line item." };
  }

  const items: LineItemInput[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const description = String((entry as Record<string, unknown>).description ?? "").trim();
    const quantity = Number((entry as Record<string, unknown>).quantity);
    const unitPrice = Number((entry as Record<string, unknown>).unit_price);
    if (!description) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) return { items: [], error: "Every line item needs a quantity greater than 0." };
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { items: [], error: "Every line item needs a valid unit price." };
    items.push({ description, quantity, unit_price: unitPrice });
  }
  if (items.length === 0) return { items: [], error: "Add at least one line item with a description." };
  return { items };
}

function parseMoney(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ---------------------------------------------------------------------
// Create / Edit / Send / Cancel
// ---------------------------------------------------------------------

export async function createProviderInvoiceAction(providerId: string, formData: FormData): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();

  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  if (!dueDateRaw) return { error: "A payment due date is required." };
  const invoiceDateRaw = String(formData.get("invoice_date") ?? "").trim();

  const { items, error: lineItemError } = parseLineItems(formData);
  if (lineItemError) return { error: lineItemError };

  const supabase = await createSupabaseServerClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("provider_invoices")
    .insert({
      cleaning_provider_id: providerId,
      created_by: crmAdmin.id,
      updated_by: crmAdmin.id,
      invoice_date: invoiceDateRaw || new Date().toISOString().slice(0, 10),
      due_date: dueDateRaw,
      description: textOrNull(formData, "description"),
      discount_amount: parseMoney(formData, "discount_amount"),
      tax_amount: parseMoney(formData, "tax_amount"),
      internal_notes: textOrNull(formData, "internal_notes"),
      payment_instructions: textOrNull(formData, "payment_instructions"),
      status: formData.get("mark_as_sent") === "true" ? "sent" : "draft",
      sent_at: formData.get("mark_as_sent") === "true" ? new Date().toISOString() : null,
    })
    .select("id, invoice_number")
    .single();
  if (invoiceError || !invoice) return { error: "Failed to create the invoice." };

  const { error: lineItemsError } = await supabase.from("provider_invoice_line_items").insert(
    items.map((item, index) => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: index,
    }))
  );
  if (lineItemsError) {
    await supabase.from("provider_invoices").delete().eq("id", invoice.id);
    return { error: "Failed to save the line items." };
  }

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "invoice_created",
    notes: `Invoice ${invoice.invoice_number} created by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/invoices");
  return { invoiceId: invoice.id as string };
}

export async function updateProviderInvoiceAction(
  invoiceId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("provider_invoices")
    .select("status, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!existing) return { error: "Invoice not found." };
  if ((existing as Pick<ProviderInvoiceRow, "status">).status === "cancelled") {
    return { error: "A cancelled invoice can't be edited." };
  }

  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  if (!dueDateRaw) return { error: "A payment due date is required." };
  const invoiceDateRaw = String(formData.get("invoice_date") ?? "").trim();

  const { items, error: lineItemError } = parseLineItems(formData);
  if (lineItemError) return { error: lineItemError };

  const { error: updateError } = await supabase
    .from("provider_invoices")
    .update({
      updated_by: crmAdmin.id,
      invoice_date: invoiceDateRaw || undefined,
      due_date: dueDateRaw,
      description: textOrNull(formData, "description"),
      discount_amount: parseMoney(formData, "discount_amount"),
      tax_amount: parseMoney(formData, "tax_amount"),
      internal_notes: textOrNull(formData, "internal_notes"),
      payment_instructions: textOrNull(formData, "payment_instructions"),
    })
    .eq("id", invoiceId);
  if (updateError) return { error: "Failed to update the invoice." };

  // Replace line items wholesale - the recalc trigger on
  // provider_invoice_line_items keeps subtotal/total in sync regardless
  // of how many rows changed.
  const { error: deleteError } = await supabase.from("provider_invoice_line_items").delete().eq("invoice_id", invoiceId);
  if (deleteError) return { error: "Failed to update the line items." };

  const { error: insertError } = await supabase.from("provider_invoice_line_items").insert(
    items.map((item, index) => ({
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: index,
    }))
  );
  if (insertError) return { error: "Failed to update the line items." };

  await syncOverdueInvoices(supabase, providerId);

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/invoices");
  return { invoiceId };
}

export async function markProviderInvoiceSentAction(invoiceId: string, providerId: string): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("provider_invoices")
    .select("status, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!existing) return { error: "Invoice not found." };
  const row = existing as Pick<ProviderInvoiceRow, "status" | "invoice_number">;
  if (row.status !== "draft") return { error: "Only a draft invoice can be marked as sent." };

  const { error } = await supabase
    .from("provider_invoices")
    .update({ status: "sent", sent_at: new Date().toISOString(), updated_by: crmAdmin.id })
    .eq("id", invoiceId);
  if (error) return { error: "Failed to mark the invoice as sent." };

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "invoice_sent",
    notes: `Invoice ${row.invoice_number} marked as sent by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/invoices");
  return {};
}

export async function cancelProviderInvoiceAction(
  invoiceId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to cancel an invoice." };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("provider_invoices")
    .select("status, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!existing) return { error: "Invoice not found." };
  const row = existing as Pick<ProviderInvoiceRow, "status" | "invoice_number">;
  if (row.status === "cancelled") return { error: "This invoice is already cancelled." };

  const { error } = await supabase
    .from("provider_invoices")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: crmAdmin.id,
      cancel_reason: reason,
      updated_by: crmAdmin.id,
    })
    .eq("id", invoiceId);
  if (error) return { error: "Failed to cancel the invoice." };

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "invoice_cancelled",
    notes: `Invoice ${row.invoice_number} cancelled by ${crmAdmin.full_name || crmAdmin.email}. Reason: ${reason}`,
  });

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/invoices");
  return {};
}

// ---------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------

export async function recordProviderPaymentAction(
  invoiceId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: invoice } = await supabase
    .from("provider_invoices")
    .select("status, total, amount_paid, balance, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  const invoiceRow = invoice as Pick<ProviderInvoiceRow, "status" | "total" | "amount_paid" | "balance" | "invoice_number">;
  if (invoiceRow.status === "cancelled") return { error: "Payments can't be recorded against a cancelled invoice." };

  const amount = Number(String(formData.get("amount") ?? "").trim());
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a payment amount greater than 0." };

  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) return { error: "Please select a payment method." };

  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const allowOverpayment = formData.get("allow_overpayment") === "true";

  const wouldBeTotal = invoiceRow.amount_paid + amount;
  if (wouldBeTotal > invoiceRow.total && !allowOverpayment) {
    const overBy = wouldBeTotal - invoiceRow.total;
    return {
      error: `This payment would overpay invoice ${invoiceRow.invoice_number} by ${formatCad(overBy)}. Confirm the overpayment to continue.`,
      requiresOverpayConfirmation: true,
    };
  }

  let attachmentPath: string | undefined;
  const receiptFile = formData.get("attachment");
  if (receiptFile instanceof File && receiptFile.size > 0) {
    const result = await uploadPaymentReceipt({ cleaningProviderId: providerId, file: receiptFile });
    if (result.error) return { error: result.error };
    attachmentPath = result.path;
  }

  const { error } = await supabase.from("provider_payments").insert({
    invoice_id: invoiceId,
    cleaning_provider_id: providerId,
    payment_date: paymentDateRaw || new Date().toISOString().slice(0, 10),
    amount,
    payment_method: paymentMethod,
    reference_number: textOrNull(formData, "reference_number"),
    notes: textOrNull(formData, "notes"),
    recorded_by: crmAdmin.id,
    recorded_by_name: crmAdmin.full_name || crmAdmin.email,
    attachment_path: attachmentPath ?? null,
  });
  if (error) return { error: "Failed to record the payment." };

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "payment_recorded",
    notes: `Payment of ${formatCad(amount)} recorded against invoice ${invoiceRow.invoice_number} by ${crmAdmin.full_name || crmAdmin.email}.`,
  });

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/invoices");
  return {};
}

export async function correctProviderPaymentAction(
  paymentId: string,
  invoiceId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to correct a payment." };

  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase.from("provider_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return { error: "Payment not found." };
  const paymentRow = payment as ProviderPaymentRow;
  if (paymentRow.reversed_at) return { error: "This payment has been reversed and can't be corrected. Record a new payment instead." };

  const amount = Number(String(formData.get("amount") ?? "").trim());
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a payment amount greater than 0." };
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) return { error: "Please select a payment method." };
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const allowOverpayment = formData.get("allow_overpayment") === "true";

  const { data: invoice } = await supabase
    .from("provider_invoices")
    .select("total, amount_paid, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found." };
  const invoiceRow = invoice as Pick<ProviderInvoiceRow, "total" | "amount_paid" | "invoice_number">;

  const wouldBeTotal = invoiceRow.amount_paid - paymentRow.amount + amount;
  if (wouldBeTotal > invoiceRow.total && !allowOverpayment) {
    const overBy = wouldBeTotal - invoiceRow.total;
    return {
      error: `This correction would overpay invoice ${invoiceRow.invoice_number} by ${formatCad(overBy)}. Confirm the overpayment to continue.`,
      requiresOverpayConfirmation: true,
    };
  }

  const previousValues = {
    amount: paymentRow.amount,
    payment_date: paymentRow.payment_date,
    payment_method: paymentRow.payment_method,
    reference_number: paymentRow.reference_number,
    notes: paymentRow.notes,
  };
  const newValues = {
    amount,
    payment_date: paymentDateRaw || paymentRow.payment_date,
    payment_method: paymentMethod,
    reference_number: textOrNull(formData, "reference_number"),
    notes: textOrNull(formData, "notes"),
  };

  const { error: updateError } = await supabase
    .from("provider_payments")
    .update({ ...newValues, updated_at: new Date().toISOString() })
    .eq("id", paymentId);
  if (updateError) return { error: "Failed to correct the payment." };

  await supabase.from("provider_payment_adjustments").insert({
    payment_id: paymentId,
    invoice_id: invoiceId,
    adjustment_type: "correction",
    reason,
    previous_values: previousValues,
    new_values: newValues,
    performed_by: crmAdmin.id,
    performed_by_name: crmAdmin.full_name || crmAdmin.email,
  });

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "payment_corrected",
    notes: `Payment on invoice ${invoiceRow.invoice_number} corrected by ${crmAdmin.full_name || crmAdmin.email}: ${formatCad(previousValues.amount)} → ${formatCad(amount)}. Reason: ${reason}`,
  });

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/invoices");
  return {};
}

export async function reverseProviderPaymentAction(
  paymentId: string,
  invoiceId: string,
  providerId: string,
  formData: FormData
): Promise<ActionResult> {
  const crmAdmin = await requireCrmAdmin();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "A reason is required to reverse a payment." };

  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase.from("provider_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return { error: "Payment not found." };
  const paymentRow = payment as ProviderPaymentRow;
  if (paymentRow.reversed_at) return { error: "This payment has already been reversed." };

  const { data: invoice } = await supabase
    .from("provider_invoices")
    .select("invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();
  const invoiceNumber = (invoice as Pick<ProviderInvoiceRow, "invoice_number"> | null)?.invoice_number ?? "";

  const reversedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("provider_payments")
    .update({ reversed_at: reversedAt, reversed_by: crmAdmin.id, reversal_reason: reason, updated_at: reversedAt })
    .eq("id", paymentId);
  if (updateError) return { error: "Failed to reverse the payment." };

  await supabase.from("provider_payment_adjustments").insert({
    payment_id: paymentId,
    invoice_id: invoiceId,
    adjustment_type: "reversal",
    reason,
    previous_values: { reversed_at: null },
    new_values: { reversed_at: reversedAt, reversed_by: crmAdmin.id, reversal_reason: reason },
    performed_by: crmAdmin.id,
    performed_by_name: crmAdmin.full_name || crmAdmin.email,
  });

  await supabase.from("crm_activities").insert({
    cleaning_provider_id: providerId,
    agent_id: crmAdmin.id,
    activity_type: "payment_reversed",
    notes: `Payment of ${formatCad(paymentRow.amount)} on invoice ${invoiceNumber} reversed by ${crmAdmin.full_name || crmAdmin.email}. Reason: ${reason}`,
  });

  await syncOverdueInvoices(supabase, providerId);

  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/invoices");
  return {};
}

export async function getPaymentReceiptUrlAction(attachmentPath: string): Promise<{ url: string | null }> {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from("provider-files").createSignedUrl(attachmentPath, 600);
  if (error || !data) return { url: null };
  return { url: data.signedUrl };
}
