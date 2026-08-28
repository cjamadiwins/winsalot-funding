"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { consumeAgreementToken, markAgreementTokenOpened } from "@/lib/crm-agreement-tokens";
import { sendSignedAgreementClientCopy, sendAgreementSignedAdminNotificationEmail, getGrowthCrmNotificationEmail } from "@/lib/crm-agreement-emails";
import { notifyAdminsOfSignedAgreement, notifyAdminsOfAgreementNotificationFailure } from "@/lib/crm-agreement-notifications";
import { DEFAULT_INTAKE_QUESTIONS, type CrmClientAgreementRow } from "@/lib/crm-agreement-types";

type ActionResult = { error?: string };

// Public, unauthenticated - resolves the token through the service-role
// client only (never the anon/session client), exactly like the
// consultation-booking public pages. Records the "opened" milestone the
// first time this succeeds, matching the "never overwrite an earlier
// event" rule used everywhere else in this codebase (is(...).null()
// guard).
export async function recordAgreementOpenedAction(token: string): Promise<void> {
  await markAgreementTokenOpened(token);
  const admin = getSupabaseAdmin();

  const { data: tokenRow } = await admin.from("crm_agreement_tokens").select("agreement_id").eq("token", token).maybeSingle();
  if (!tokenRow) return;

  const { data: agreement } = await admin.from("crm_client_agreements").select("opened_at").eq("id", tokenRow.agreement_id).maybeSingle();
  if (agreement && !agreement.opened_at) {
    await admin.from("crm_client_agreements").update({ opened_at: new Date().toISOString() }).eq("id", tokenRow.agreement_id);
    await admin.from("crm_agreement_events").insert({ agreement_id: tokenRow.agreement_id, event_type: "opened", actor_type: "client" });
  }
}

export type AcceptAgreementInput = {
  token: string;
  fullLegalName: string;
  jobTitle: string;
  businessName: string;
  accepted: boolean;
  signatureText: string;
};

// Item 5: electronic acceptance. Consumes the token atomically (a
// concurrent double-submit can only ever win once), records the four
// required fields plus date/time and agreement version, generates the
// signed PDF, and emails copies to the client and admin. Never allows a
// second acceptance of the same agreement - src/lib/crm-agreement-tokens.ts's
// consumeAgreementToken() and the database's own signed-immutability
// trigger (migration 0097) both independently guarantee this.
export async function acceptAgreementAction(input: AcceptAgreementInput): Promise<ActionResult> {
  if (!input.fullLegalName.trim()) return { error: "Your full legal name is required." };
  if (!input.jobTitle.trim()) return { error: "Your job title is required." };
  if (!input.businessName.trim()) return { error: "Your business name is required." };
  if (!input.accepted) return { error: "You must check the acceptance box to sign." };
  if (!input.signatureText.trim()) return { error: "A typed signature is required." };

  const consumed = await consumeAgreementToken(input.token);
  if (!consumed.ok) return { error: consumed.error };

  const admin = getSupabaseAdmin();
  const { data: agreement } = await admin.from("crm_client_agreements").select("*").eq("id", consumed.agreementId).maybeSingle();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status !== "sent") return { error: "This agreement is not currently awaiting signature." };

  const acceptedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("crm_client_agreements")
    .update({
      status: "signed",
      signer_full_name: input.fullLegalName.trim(),
      signer_job_title: input.jobTitle.trim(),
      signer_business_name: input.businessName.trim(),
      signer_accepted: true,
      signer_signature_text: input.signatureText.trim(),
      accepted_at: acceptedAt,
    })
    .eq("id", agreement.id);

  if (updateError) return { error: "Failed to record your signature. Please try again or contact Winsalot Corp." };

  await admin.from("crm_agreement_events").insert({ agreement_id: agreement.id, event_type: "accepted", actor_type: "client" });

  await admin.from("crm_activities").insert({
    client_id: agreement.client_id,
    opportunity_id: agreement.opportunity_id,
    activity_type: "agreement_signed",
    notes: `Agreement signed by ${input.fullLegalName.trim()} (${input.jobTitle.trim()}).`,
  });

  const { data: template } = await admin.from("crm_agreement_templates").select("content").eq("id", agreement.template_id).maybeSingle();
  const signedAgreement = { ...agreement, status: "signed", signer_full_name: input.fullLegalName.trim(), accepted_at: acceptedAt } as CrmClientAgreementRow;

  if (template) {
    const clientCopyResult = await sendSignedAgreementClientCopy(signedAgreement, template);
    if (clientCopyResult.error) {
      // The signature itself is already saved - a failed copy email is
      // reported but never blocks the client from seeing "signed"
      // confirmation, since the signature (the legally meaningful part)
      // already succeeded.
      console.error("[agreement-sign] Failed to send the client's signed copy:", clientCopyResult.error);
    }

    // Item 1: in-app admin notification always fires, independent of
    // whether the admin's own notification EMAIL below succeeds - the
    // two are separate required channels.
    await notifyAdminsOfSignedAgreement({
      agreementId: agreement.id,
      businessName: signedAgreement.legal_business_name,
      agreementNumber: signedAgreement.agreement_number,
    });

    const adminNotificationEmail = getGrowthCrmNotificationEmail();
    const adminEmailResult = await sendAgreementSignedAdminNotificationEmail(signedAgreement, template, adminNotificationEmail);
    if (adminEmailResult.error) {
      console.error("[agreement-sign] Failed to send the admin notification email:", adminEmailResult.error);
      await admin
        .from("crm_client_agreements")
        .update({ admin_notification_failed_at: new Date().toISOString(), admin_notification_error: adminEmailResult.error })
        .eq("id", agreement.id);
      // Item 3: notify the admin (in-app) that their own notification
      // email failed, with the reason - the Retry button lives on the
      // agreement detail page this links to.
      await notifyAdminsOfAgreementNotificationFailure({
        agreementId: agreement.id,
        businessName: signedAgreement.legal_business_name,
        reason: adminEmailResult.error,
      });
    } else {
      await admin
        .from("crm_client_agreements")
        .update({ admin_notified_at: new Date().toISOString(), admin_notification_failed_at: null, admin_notification_error: null })
        .eq("id", agreement.id);
    }
  }

  // Auto-create (never auto-send) the intake config so it's ready for
  // the admin to customize - item 6/8: "create a secure, client-specific
  // Growth CRM intake form" happens now, "Send Intake Form" stays a
  // deliberate later admin action.
  const { data: existingConfig } = await admin.from("crm_intake_configs").select("id").eq("agreement_id", agreement.id).maybeSingle();
  if (!existingConfig) {
    await admin.from("crm_intake_configs").insert({
      client_id: agreement.client_id,
      agreement_id: agreement.id,
      opportunity_id: agreement.opportunity_id,
      questions: DEFAULT_INTAKE_QUESTIONS,
    });
  }

  return {};
}
