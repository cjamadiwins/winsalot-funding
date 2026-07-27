"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buildLeadgenBookingEmailHtml, sendLeadgenEmail } from "@/lib/leadgen-email";
import { isValidEmail, LEADGEN_BOOKING_BUTTON_LABEL, leadgenServicesButtonLabel, resolveLeadgenEmailBranding } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

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
  if (templateKey === "consultation_invitation") {
    const { data: clientRow } = await supabase.from("leadgen_clients").select("name, slug, booking_link, services_info_link").eq("id", clientId).maybeSingle();
    if (clientRow) {
      const branding = resolveLeadgenEmailBranding(clientRow, submittedBookingUrl ?? clientRow.booking_link, submittedServicesUrl ?? clientRow.services_info_link);
      html = buildLeadgenBookingEmailHtml(body, [
        { url: branding.bookingUrl, label: LEADGEN_BOOKING_BUTTON_LABEL, style: "link" },
        { url: branding.servicesUrl, label: leadgenServicesButtonLabel(branding.clientName) },
      ]);
    }
  }

  const result = await sendLeadgenEmail(supabase, {
    clientId,
    campaignId,
    templateKey,
    toEmail,
    subject,
    body,
    html,
    sentBy: admin.id,
    clientVisible: true,
  });

  if (result.error) return { error: result.error };

  revalidatePath(`/leadgen/admin/clients/${clientId}`);
  return {};
}
