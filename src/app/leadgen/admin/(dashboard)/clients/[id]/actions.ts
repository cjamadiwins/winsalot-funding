"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buildLeadgenBookingEmailHtml, sendLeadgenEmail } from "@/lib/leadgen-email";
import { isValidEmail, LEADGEN_BOOKING_BUTTON_LABEL, leadgenServicesButtonLabel, resolveLeadgenEmailBranding } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

// Admin-only edit for the five Client Call Script fields (brief "Client
// customization"). Never reachable by an agent - this file only exports
// server actions, and every one of them independently calls
// requireLeadgenAdmin() itself; RLS (leadgen_clients_admin_all being the
// only write policy on this table) is the real, defense-in-depth backstop.
export async function updateClientCallScriptAction(clientId: string, formData: FormData): Promise<ActionResult> {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("leadgen_clients")
    .update({
      call_script_value_proposition: textOrNull(formData, "call_script_value_proposition"),
      call_script_services: textOrNull(formData, "call_script_services"),
      call_script_closing: textOrNull(formData, "call_script_closing"),
      call_script_notes: textOrNull(formData, "call_script_notes"),
      call_script_override: textOrNull(formData, "call_script_override"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);
  if (error) return { error: "Failed to save the call script." };

  revalidatePath(`/leadgen/admin/clients/${clientId}`);
  revalidatePath("/leadgen/admin");
  revalidatePath("/leadgen/agent");
  return {};
}

// Direct client email (brief section "DIRECT CLIENT EMAIL FROM THE
// CRM") - admin-only. lead_id is always null on the resulting row,
// which is exactly what marks it as a client-facing communication
// rather than a prospect email (see leadgen_emails RLS in the schema
// comment). Always client-visible, since the whole point is the client
// seeing it in their Communications view.
export async function sendClientCommunicationAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const campaignId = String(formData.get("campaign_id") ?? "").trim() || null;
  const templateKey = String(formData.get("template_key") ?? "").trim() || null;
  const submittedBookingUrl = String(formData.get("booking_url") ?? "").trim() || null;
  const submittedServicesUrl = String(formData.get("services_url") ?? "").trim() || null;

  if (!toEmail || !isValidEmail(toEmail)) return { error: "Enter a valid recipient email address." };
  if (!subject) return { error: "A subject is required." };
  if (!body) return { error: "An email body is required." };

  const supabase = await createSupabaseServerClient();

  // Only the "Brent's Essentials - 15-Minute Consultation" template
  // (consultation_invitation) needs real HTML buttons - every other
  // template/blank email keeps sending as plain text -> textToSimpleHtml,
  // unchanged. Re-validates against the DB row (not just the submitted
  // hidden fields) exactly like the lead-based send actions, so a Brent's
  // Essentials email from this composer can never go out with a missing
  // button either.
  let html: string | undefined;
  let text = body;
  if (templateKey === "consultation_invitation") {
    const { data: clientRow } = await supabase.from("leadgen_clients").select("name, slug, booking_link, services_info_link").eq("id", clientId).maybeSingle();
    if (clientRow) {
      const branding = resolveLeadgenEmailBranding(clientRow, submittedBookingUrl ?? clientRow.booking_link, submittedServicesUrl ?? clientRow.services_info_link);
      if (/<a\s+href/i.test(body)) {
        html = body;
        text = body.replace(/<[^>]*>/g, "").replace(/\n{3,}/g, "\n\n").trim();
      } else {
        html = buildLeadgenBookingEmailHtml(body, [
          { url: branding.bookingUrl, label: LEADGEN_BOOKING_BUTTON_LABEL, style: "booking" },
          { url: branding.servicesUrl, label: leadgenServicesButtonLabel(branding.clientName) },
        ]);
      }
    }
  }

  const result = await sendLeadgenEmail(supabase, {
    clientId,
    campaignId,
    templateKey,
    toEmail,
    subject,
    body,
    text,
    html,
    sentBy: admin.id,
    clientVisible: true,
  });

  if (result.error) return { error: result.error };

  revalidatePath(`/leadgen/admin/clients/${clientId}`);
  return {};
}
