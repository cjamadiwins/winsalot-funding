"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import { notifyAdminsOfClientConversionReport } from "@/lib/leadgen-conversion-notifications";
import {
  LEADGEN_CLIENT_REPORTED_RESULTS,
  LEADGEN_CLIENT_REPORTED_RESULT_LABELS,
  LEADGEN_CLIENT_CONVERSION_CONFIRMATION_TEXT,
  type LeadgenClientReportedResult,
} from "@/lib/leadgen-conversions";

type ActionResult = { error?: string; message?: string };

// Client Portal "Report Conversion" (brief "REPORT CONVERSION FORM"). Never
// trusts a client-submitted client_id - identity comes entirely from the
// authenticated session (requireLeadgenPortalClient), and the update below
// is scoped by BOTH the conversion id AND this session's own client_id, so
// a tampered conversionId in the request can never report against another
// client's record even if RLS (leadgen_conversions_client_update_own,
// defense in depth) were ever bypassed. This can only ever move
// admin_verification_status to 'pending_admin_verification' - it never
// writes conversion_status itself, which stays Admin-only (see
// /leadgen/admin/conversions/actions.ts's confirmClientReportAction) so a
// client report can never itself trigger Winsalot billing.
export async function reportConversionAction(conversionId: string, formData: FormData): Promise<ActionResult> {
  const { user, client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const resultRaw = String(formData.get("client_reported_result") ?? "").trim();
  if (!LEADGEN_CLIENT_REPORTED_RESULTS.includes(resultRaw as LeadgenClientReportedResult)) {
    return { error: "Select a conversion result." };
  }
  const reportedResult = resultRaw as LeadgenClientReportedResult;
  const isPayingCustomer = reportedResult === "paying_customer";

  const conversionDateRaw = String(formData.get("client_reported_conversion_date") ?? "").trim() || null;
  const saleAmountRaw = String(formData.get("client_reported_sale_amount") ?? "").trim();
  const saleAmount = saleAmountRaw ? Number(saleAmountRaw) : null;
  if (saleAmountRaw && (!Number.isFinite(saleAmount) || (saleAmount as number) < 0)) {
    return { error: "Enter a valid sale amount." };
  }
  const notes = String(formData.get("client_reported_notes") ?? "").trim() || null;
  const confirmationChecked = formData.get("client_confirmation_checked") === "true";

  // The exact required checkbox (brief) - must be checked before a paying-
  // customer report can be submitted at all.
  if (isPayingCustomer && !confirmationChecked) {
    return { error: `Please check "${LEADGEN_CLIENT_CONVERSION_CONFIRMATION_TEXT}" before submitting.` };
  }

  const { data: existing } = await supabase
    .from("leadgen_conversions")
    .select("id, appointment_id")
    .eq("id", conversionId)
    .eq("client_id", client.id)
    .maybeSingle();
  if (!existing) return { error: "Conversion record not found." };

  const { error } = await supabase
    .from("leadgen_conversions")
    .update({
      admin_verification_status: "pending_admin_verification",
      client_reported_result: reportedResult,
      client_reported_at: new Date().toISOString(),
      client_reported_by: user.id,
      // Conversion date / sale amount are only meaningful for a
      // paying-customer report (brief: "If the client selects Prospect
      // Became a Paying Customer, allow them to enter...").
      client_reported_conversion_date: isPayingCustomer ? conversionDateRaw : null,
      client_reported_sale_amount: isPayingCustomer ? saleAmount : null,
      client_reported_notes: notes,
      client_confirmation_checked: isPayingCustomer ? confirmationChecked : false,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversionId)
    .eq("client_id", client.id);
  if (error) return { error: "Failed to submit your conversion report." };

  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("leadgen_appointments").select("business_name").eq("id", existing.appointment_id).maybeSingle();
  await notifyAdminsOfClientConversionReport(admin, {
    conversionId,
    clientName: client.name,
    businessName: appointment?.business_name ?? "a prospect",
    resultLabel: LEADGEN_CLIENT_REPORTED_RESULT_LABELS[reportedResult],
  });

  // Simple confirmation email (brief "CLIENT EMAIL": "a simple confirmation
  // may be sent after the client submits a conversion report" using the
  // existing tracked-email system) - sent to the submitting user, never
  // includes any internal Winsalot billing information.
  if (user.email) {
    await sendLeadgenEmail(supabase, {
      clientId: client.id,
      toEmail: user.email,
      toName: user.full_name || null,
      subject: "Conversion Update Received",
      body: "Thank you. Your conversion update has been received and is pending review by Winsalot Corp.",
      sentBy: user.id,
      clientVisible: false,
    });
  }

  revalidatePath("/client/conversions");
  return { message: "Thank you. Your conversion update has been received and is pending review by Winsalot Corp." };
}
