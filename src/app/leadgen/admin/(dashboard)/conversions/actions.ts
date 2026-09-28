"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LEADGEN_CONVERSION_STATUSES, type LeadgenConversionStatus, type LeadgenConversionRow } from "@/lib/leadgen-conversions";
import { triggerPerformancePaymentIfEligible } from "@/lib/leadgen-conversion-payment-trigger";
import { notifyAdminsOfPerformancePaymentTrigger } from "@/lib/leadgen-conversion-notifications";
import type { CrmClientAgreementRow } from "@/lib/crm-agreement-types";

type ActionResult = { error?: string; message?: string };
type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

// Duplicate-conversion guard (brief: "Prevent the same prospect from
// being counted as multiple conversions for the same campaign unless
// there is a legitimate separate transaction and Admin explicitly
// approves it"). Matches on the linked appointment's business name within
// the same campaign, since a legitimate repeat customer may come through
// a brand new lead/appointment record entirely rather than the same one.
async function checkForDuplicateConversion(
  supabase: ServerSupabase,
  conversion: Pick<LeadgenConversionRow, "id" | "campaign_id" | "appointment_id">
): Promise<{ hasDuplicate: boolean; warning?: string }> {
  if (!conversion.campaign_id) return { hasDuplicate: false };

  const { data: thisAppointment } = await supabase.from("leadgen_appointments").select("business_name").eq("id", conversion.appointment_id).maybeSingle();
  const businessName = (thisAppointment?.business_name ?? "").trim();
  if (!businessName) return { hasDuplicate: false };

  const { data: otherConversions } = await supabase
    .from("leadgen_conversions")
    .select("id, appointment_id")
    .eq("campaign_id", conversion.campaign_id)
    .eq("conversion_status", "converted_paid")
    .neq("id", conversion.id);
  if (!otherConversions || otherConversions.length === 0) return { hasDuplicate: false };

  const { data: otherAppointments } = await supabase
    .from("leadgen_appointments")
    .select("business_name")
    .in(
      "id",
      otherConversions.map((c) => c.appointment_id)
    );
  const normalized = businessName.toLowerCase();
  const match = (otherAppointments ?? []).some((a) => a.business_name.trim().toLowerCase() === normalized);
  if (!match) return { hasDuplicate: false };

  return {
    hasDuplicate: true,
    warning: `${businessName} already has a confirmed "Converted – Paid" record in this campaign. Check "This is a legitimate separate transaction" to confirm anyway.`,
  };
}

// Fires the client's performance-payment trigger (if any) once Admin
// confirms a converted_paid conversion - crosses from the Lead Gen CRM's
// own auth domain (requireLeadgenAdmin, already checked by every caller
// below) into the Growth CRM's crm_client_agreements table via the
// service-role client, exactly like every other Lead Gen CRM read that
// needs data outside its own RLS-visible tables. Never touches
// recordConversionNotificationAction/generatePerformanceBasedFirstInvoiceAction
// (crm/agreements/actions.ts) - this is a separate, atomic-guarded write
// path so neither can interfere with the other.
async function maybeTriggerPerformancePayment(
  conversion: Pick<LeadgenConversionRow, "id" | "client_id" | "campaign_id">,
  confirmedByUserId: string
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data: crmClient } = await admin.from("crm_clients").select("id").eq("leadgen_client_id", conversion.client_id).maybeSingle();
  if (!crmClient) return null;

  const { data: agreement } = await admin
    .from("crm_client_agreements")
    .select("*")
    .eq("client_id", crmClient.id)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!agreement) return null;

  const trigger = await triggerPerformancePaymentIfEligible(admin, {
    conversionId: conversion.id,
    clientId: conversion.client_id,
    campaignId: conversion.campaign_id,
    crmClientId: crmClient.id as string,
    agreement: agreement as CrmClientAgreementRow,
    confirmedBy: confirmedByUserId,
  });
  if (!trigger) return null;

  const { data: leadgenClient } = await admin.from("leadgen_clients").select("name").eq("id", conversion.client_id).maybeSingle();
  await notifyAdminsOfPerformancePaymentTrigger(admin, {
    triggerId: trigger.id,
    clientName: leadgenClient?.name ?? "Client",
    stageLabel: trigger.payment_stage_label,
    amount: trigger.amount_triggered,
    currency: trigger.currency,
  });

  return `Performance payment triggered: ${trigger.payment_stage_label} - ${trigger.currency} ${trigger.amount_triggered.toLocaleString()} is now due. Do not mark it as received until Winsalot actually receives payment.`;
}

// Admin's general "change conversion status / add notes / record
// conversion date / record sale amount" control - available on any
// conversion record regardless of whether a client has ever reported
// anything (brief: "Admin must be able to view and manage conversion
// status for each... lead", independent of client self-reporting).
export async function updateConversionStatusAction(conversionId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const status = String(formData.get("conversion_status") ?? "").trim();
  if (!LEADGEN_CONVERSION_STATUSES.includes(status as LeadgenConversionStatus)) return { error: "Invalid conversion status." };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("leadgen_conversions").select("*").eq("id", conversionId).maybeSingle();
  if (!existing) return { error: "Conversion record not found." };
  const conversion = existing as LeadgenConversionRow;

  const adminConversionDate = textOrNull(formData, "admin_conversion_date");
  const adminSaleAmountRaw = textOrNull(formData, "admin_sale_amount");
  const adminSaleAmount = adminSaleAmountRaw ? Number(adminSaleAmountRaw) : null;
  if (adminSaleAmountRaw && (!Number.isFinite(adminSaleAmount) || (adminSaleAmount as number) < 0)) {
    return { error: "Sale amount must be a positive number." };
  }
  const adminNotes = textOrNull(formData, "admin_notes");
  const isNewlyPaid = status === "converted_paid" && conversion.conversion_status !== "converted_paid";

  if (isNewlyPaid) {
    const duplicateCheck = await checkForDuplicateConversion(supabase, conversion);
    if (duplicateCheck.hasDuplicate && formData.get("duplicate_override") !== "true") {
      return { error: duplicateCheck.warning! };
    }
  }

  const statusChanged = conversion.conversion_status !== status;
  const { error } = await supabase
    .from("leadgen_conversions")
    .update({
      conversion_status: status,
      admin_conversion_date: adminConversionDate,
      admin_sale_amount: adminSaleAmount,
      admin_notes: adminNotes,
      ...(statusChanged ? { conversion_status_set_by: adminUser.id, conversion_status_set_at: new Date().toISOString() } : {}),
      ...(formData.get("duplicate_override") === "true" ? { duplicate_override_by: adminUser.id, duplicate_override_at: new Date().toISOString() } : {}),
      updated_by: adminUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversionId);
  if (error) return { error: "Failed to update the conversion record." };

  const paymentMessage = isNewlyPaid ? await maybeTriggerPerformancePayment(conversion, adminUser.id) : null;

  revalidatePath("/leadgen/admin/conversions");
  revalidatePath("/leadgen/admin");
  return { message: paymentMessage ?? "Conversion record updated." };
}

// Admin approval workflow (brief "ADMIN APPROVAL"): resolves a pending
// client-reported conversion. Only ever reachable while
// admin_verification_status is still 'pending_admin_verification' - a
// client's own submission can never itself set conversion_status, so this
// is the only path that turns a client report into a billing-relevant
// conversion_status.
export async function confirmClientReportAction(conversionId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const status = String(formData.get("conversion_status") ?? "").trim();
  if (status !== "converted_paid" && status !== "converted_payment_pending" && status !== "proposal_sent" && status !== "follow_up_open" && status !== "not_converted") {
    return { error: "Select a valid conversion status to confirm." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("leadgen_conversions").select("*").eq("id", conversionId).maybeSingle();
  if (!existing) return { error: "Conversion record not found." };
  const conversion = existing as LeadgenConversionRow;
  if (conversion.admin_verification_status !== "pending_admin_verification") {
    return { error: "This conversion has no pending client report to confirm." };
  }

  const adminConversionDate = textOrNull(formData, "admin_conversion_date") ?? conversion.client_reported_conversion_date;
  const adminSaleAmountRaw = textOrNull(formData, "admin_sale_amount");
  const adminSaleAmount = adminSaleAmountRaw ? Number(adminSaleAmountRaw) : conversion.client_reported_sale_amount;
  const adminNotes = textOrNull(formData, "admin_notes");

  if (status === "converted_paid") {
    const duplicateCheck = await checkForDuplicateConversion(supabase, conversion);
    if (duplicateCheck.hasDuplicate && formData.get("duplicate_override") !== "true") {
      return { error: duplicateCheck.warning! };
    }
  }

  const { error } = await supabase
    .from("leadgen_conversions")
    .update({
      conversion_status: status as LeadgenConversionStatus,
      admin_verification_status: "confirmed",
      admin_conversion_date: adminConversionDate,
      admin_sale_amount: adminSaleAmount,
      admin_notes: adminNotes,
      conversion_status_set_by: adminUser.id,
      conversion_status_set_at: new Date().toISOString(),
      ...(formData.get("duplicate_override") === "true" ? { duplicate_override_by: adminUser.id, duplicate_override_at: new Date().toISOString() } : {}),
      updated_by: adminUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversionId);
  if (error) return { error: "Failed to confirm the conversion." };

  const paymentMessage = status === "converted_paid" ? await maybeTriggerPerformancePayment(conversion, adminUser.id) : null;

  revalidatePath("/leadgen/admin/conversions");
  revalidatePath("/leadgen/admin");
  revalidatePath("/client/conversions");
  return { message: paymentMessage ?? "Client-reported conversion confirmed." };
}

// The other half of the Admin approval workflow: rejects/asks for
// clarification on a pending client report. Deliberately never touches
// conversion_status - the pipeline stage stays exactly as Admin last set
// it (or its backfilled default) until Admin separately updates it or the
// client submits a corrected report.
export async function rejectClientReportAction(conversionId: string, formData: FormData): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();

  const reason = textOrNull(formData, "rejection_reason");
  if (!reason) return { error: "A reason is required to reject or request clarification." };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("leadgen_conversions").select("admin_verification_status").eq("id", conversionId).maybeSingle();
  if (!existing) return { error: "Conversion record not found." };
  if (existing.admin_verification_status !== "pending_admin_verification") {
    return { error: "This conversion has no pending client report to reject." };
  }

  const { error } = await supabase
    .from("leadgen_conversions")
    .update({
      admin_verification_status: "rejected",
      rejection_reason: reason,
      updated_by: adminUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversionId);
  if (error) return { error: "Failed to reject the conversion report." };

  revalidatePath("/leadgen/admin/conversions");
  revalidatePath("/client/conversions");
  return { message: "Client report rejected. The client can submit a corrected report." };
}
