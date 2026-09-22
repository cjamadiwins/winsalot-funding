import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { firstNameOf } from "./winsalot-consultation-emails";
import { formatSubcontractorCurrency } from "./subcontractor-payroll";
import type { SubcontractorProfileRow } from "./crm-subcontractor-types";

// Growth CRM Referral Partners: the "Send Partner Overview Email" button
// on a referral partner's profile (e.g. Tony). Same review-before-send
// shape as crm_consultation_guides.follow_up_email_* (see
// src/lib/consultation-guide-email.ts's header comment) - generating a
// draft never sends anything; only an explicit Admin click on Send does.
// Scoped to ONE fixed subject/body shape (unlike the multi-template
// consultation-guide follow-up), parametrized by the partner's own name,
// their actual saved revenue-share/commission-share percentages, AND
// their own reporting currency (never hardcoded), so a future referral
// partner with a different split or currency (e.g. Tony's own CAD) always
// sees their own real agreed terms, not another partner's numbers.

const STANDARD_LEAD_GEN_MONTHLY_RATE = 750;
const EXAMPLE_LENDER_COMMISSION = 2000;

export type PartnerOverviewEmailDraft = { subject: string; body: string };

// Builds the Partner Overview Email draft - never sent directly. Pulls
// the partner's own saved percentages (defaulting to 40% if not yet set,
// matching the brief's Tony-specific numbers) and currency so the worked
// examples in the email always match what's actually configured on this
// partner's profile.
export function buildPartnerOverviewEmailDraft(
  partner: Pick<SubcontractorProfileRow, "full_name" | "lead_gen_revenue_share_percent" | "lending_commission_share_percent" | "currency">
): PartnerOverviewEmailDraft {
  const firstName = firstNameOf(partner.full_name || "there");
  const leadGenPercent = partner.lead_gen_revenue_share_percent ?? 40;
  const lendingPercent = partner.lending_commission_share_percent ?? 40;
  const formatUsd = (amount: number) => formatSubcontractorCurrency(amount, partner.currency);

  const leadGenPartnerShare = (STANDARD_LEAD_GEN_MONTHLY_RATE * leadGenPercent) / 100;
  const leadGenWinsalotShare = STANDARD_LEAD_GEN_MONTHLY_RATE - leadGenPartnerShare;
  const lendingPartnerShare = (EXAMPLE_LENDER_COMMISSION * lendingPercent) / 100;
  const lendingWinsalotShare = EXAMPLE_LENDER_COMMISSION - lendingPartnerShare;

  const lines: string[] = [
    `Hi ${firstName},`,
    "",
    "Thank you for speaking with me about working with Winsalot Corp.",
    "I wanted to summarize our conversation and outline how you can position Winsalot Corp.'s services when speaking with potential clients.",
    "",
    "B2B Lead Generation & Appointment Setting",
    "",
    "Winsalot Corp. helps businesses generate new business opportunities through outbound B2B prospecting and appointment setting.",
    "Our team handles outbound outreach so the client's business can focus on consultations, proposals, and closing opportunities.",
    "",
    "You can primarily introduce businesses operating in areas such as:",
    "- Website Design",
    "- Website Development",
    "- Website Redesign",
    "- SEO",
    "- Digital Marketing",
    "- IT and professional B2B services",
    "",
    'A simple way to position Winsalot is:',
    '"Winsalot Corp. provides an outsourced B2B prospecting and appointment-setting team. Winsalot handles outbound outreach, identifies businesses that may need your services, speaks with potential decision-makers, follows up with interested prospects, and works to generate qualified business opportunities for your sales team."',
    "",
    `Our standard Lead Generation service is currently ${formatUsd(STANDARD_LEAD_GEN_MONTHLY_RATE)} per month.`,
    "",
    "Your Recurring Revenue Share",
    "",
    "For Lead Generation clients you directly introduce to Winsalot Corp., our agreed structure is:",
    `${firstName}: ${leadGenPercent}%`,
    `Winsalot Corp.: ${100 - leadGenPercent}%`,
    "",
    `Your ${leadGenPercent}% revenue share continues for as long as the referred business remains an active paying Winsalot Corp. client.`,
    `For example, on a ${formatUsd(STANDARD_LEAD_GEN_MONTHLY_RATE)} monthly account:`,
    `${firstName} receives: ${formatUsd(leadGenPartnerShare)}`,
    `Winsalot Corp. receives: ${formatUsd(leadGenWinsalotShare)}`,
    "",
    "Revenue share is calculated on payments actually collected from the client.",
    "",
    "Business Lending",
    "",
    "Winsalot Corp. also assists eligible businesses seeking commercial financing through our lending relationships.",
    "The business generally does not pay Winsalot directly for this support. When a transaction successfully funds, Winsalot may receive compensation from the lender.",
    "",
    "For lending opportunities you introduce, the agreed commission-sharing structure is:",
    `${firstName}: ${lendingPercent}% of the net lender commission received by Winsalot Corp.`,
    `Winsalot Corp.: ${100 - lendingPercent}%`,
    "",
    `For example, if Winsalot receives a ${formatUsd(EXAMPLE_LENDER_COMMISSION)} lender commission:`,
    `${firstName} receives: ${formatUsd(lendingPartnerShare)}`,
    `Winsalot Corp. receives: ${formatUsd(lendingWinsalotShare)}`,
    "",
    "Commission becomes payable after Winsalot has received payment from the lender and after any applicable adjustments or clawback obligations have been accounted for.",
    "All financing remains subject to lender approval and underwriting.",
    "",
    "U.S. Funding",
    "",
    "We are currently reviewing opportunities to expand our lender relationships into the United States.",
    "Please do not represent Winsalot as having confirmed U.S. financing programs until we have provided you with confirmation of an approved U.S. lending partner.",
    "For now, confirmed Canadian opportunities can be referred to Winsalot.",
    "",
    "Ideal Lead Generation Clients",
    "",
    "The best businesses to introduce are companies that:",
    "- Sell services to other businesses",
    "- Have capacity for new customers",
    "- Have a clear service offering",
    "- Have portfolio examples or proof of completed work",
    "- Have a reasonable sales process for converting opportunities",
    "- Want consistent outbound prospecting without building an internal SDR team",
    "",
    "For website, SEO, and digital marketing businesses, we will normally need information about their services, portfolio, target customers, pricing or positioning before beginning a campaign.",
    "",
    "Partnership Process",
    "",
    "Your role is primarily to identify and introduce suitable businesses.",
    "Winsalot Corp. will handle the client consultation, onboarding, campaign management, outbound lead generation, appointment-setting operations, reporting, and business-funding process where applicable.",
    "When a business you introduce becomes an active paying client, your referral will remain linked to the account so that your recurring revenue share can be tracked.",
    "",
    "We look forward to building a productive long-term partnership.",
    "",
    "Regards,",
    "C.J. Amadi",
    "Winsalot Corp.",
    "Empowering Businesses, One Solution at a Time.",
  ];

  return {
    subject: "Winsalot Corp. Partnership Overview & Referral Structure",
    body: lines.join("\n"),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px;white-space:pre-line;">${escapeHtml(paragraph)}</p>`)
    .join("");
}

export type PartnerOverviewEmailSendResult = { status: "sent"; resendEmailId: string } | { status: "failed"; error: string };

// Sends the partner's currently-saved draft (whatever Admin last saved via
// "Edit Email", or the auto-generated original) - never recomputed at
// send time, so an Admin edit before clicking Send is exactly what the
// partner receives. Only ever called from an explicit, manual Admin click
// (sendReferralPartnerOverviewEmailAction) - never automatically.
export async function sendPartnerOverviewEmail(
  admin: SupabaseClient,
  partner: Pick<SubcontractorProfileRow, "id" | "email" | "partner_overview_email_subject" | "partner_overview_email_body">
): Promise<PartnerOverviewEmailSendResult> {
  if (!partner.email) return { status: "failed", error: "No recipient email on file for this partner." };
  if (!partner.partner_overview_email_subject || !partner.partner_overview_email_body) {
    return { status: "failed", error: "No email draft has been generated for this partner yet." };
  }

  // Same compare-and-swap claim pattern as
  // sendConsultationGuideFollowUpEmail - guards against a double-click or
  // two admin tabs both trying to send the same email at once.
  const { data: claimed, error: claimError } = await admin
    .from("crm_subcontractors")
    .update({ partner_overview_email_status: "sending" })
    .eq("id", partner.id)
    .in("partner_overview_email_status", ["not_sent", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) return { status: "failed", error: claimError.message };
  if (!claimed) return { status: "failed", error: "This email has already been sent or is currently sending." };

  const subject = partner.partner_overview_email_subject;
  const text = partner.partner_overview_email_body;
  const html = textToHtml(text);

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: getEmailSender("growth"),
      to: partner.email,
      replyTo: getEmailReplyTo(),
      subject,
      text,
      html,
    });

    if (sendError || !sendResult) {
      const errorDetail = sendError?.message ?? "Unknown Resend error.";
      await admin.from("crm_subcontractors").update({ partner_overview_email_status: "failed", partner_overview_email_error: errorDetail }).eq("id", partner.id);
      return { status: "failed", error: errorDetail };
    }

    await admin
      .from("crm_subcontractors")
      .update({
        partner_overview_email_status: "sent",
        partner_overview_email_sent_at: new Date().toISOString(),
        partner_overview_email_error: null,
      })
      .eq("id", partner.id);

    return { status: "sent", resendEmailId: sendResult.id };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : "Unknown error sending Partner Overview Email.";
    await admin.from("crm_subcontractors").update({ partner_overview_email_status: "failed", partner_overview_email_error: errorDetail }).eq("id", partner.id);
    return { status: "failed", error: errorDetail };
  }
}
