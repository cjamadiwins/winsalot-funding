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

// Builds the "Services & Selling Points" email draft - never sent
// directly. Unlike buildPartnerOverviewEmailDraft, this template's
// content is entirely fixed (no revenue-share/commission numbers to
// substitute) except the greeting, which still uses the partner's own
// first name rather than hardcoding Tony's.
export function buildServicesSellingPointsEmailDraft(partner: Pick<SubcontractorProfileRow, "full_name">): PartnerOverviewEmailDraft {
  const firstName = firstNameOf(partner.full_name || "there");

  const lines: string[] = [
    `Hi ${firstName},`,
    "",
    "As discussed, I wanted to give you a clear overview of what Winsalot Corp. provides and the main benefits you can communicate when speaking with potential clients.",
    "",
    "What Winsalot Corp. Provides",
    "",
    "1. B2B Lead Generation & Appointment Setting",
    "",
    "We help businesses create new sales opportunities through targeted outbound prospecting and appointment setting.",
    "Our team handles the outreach, follow-up, qualification, and appointment-setting process so the client can focus on consultations, proposals, and closing business.",
    "",
    "This service is especially suitable for businesses such as:",
    "- Website Design companies",
    "- Website Development companies",
    "- SEO companies",
    "- Digital Marketing agencies",
    "- Website Redesign and Rebranding providers",
    "- Other B2B service businesses",
    "",
    "What the client receives",
    "- Targeted outbound calling",
    "- Prospecting to businesses in their preferred market",
    "- Qualification of interested prospects",
    "- Appointment setting",
    "- Follow-up activity",
    "- Call and lead tracking",
    "- CRM-supported campaign management",
    "- Visibility into campaign activity and results",
    "",
    "Benefits of Working With Winsalot",
    "",
    "Save Time",
    "The client does not have to spend hours cold calling and searching for new opportunities. Our team handles the outbound prospecting.",
    "",
    "More Sales Conversations",
    "Our objective is to create qualified conversations and appointments so the client has more opportunities to present their services.",
    "",
    "Dedicated Outbound Team",
    "Instead of hiring, training, and managing an internal SDR team, the client can use Winsalot's existing outbound infrastructure.",
    "",
    "Structured Campaigns",
    "We do more than provide a contact list. We run organized outreach campaigns, track activity, follow up, and move interested prospects toward appointments.",
    "",
    "Focus on Closing",
    "Winsalot handles the top-of-funnel prospecting work, allowing the client to concentrate on consultations, proposals, relationships, and closing sales.",
    "",
    "Campaign Visibility",
    "Our CRM allows campaign activity, leads, appointments, call logs, and other relevant information to be tracked.",
    "",
    "How to Position the Service",
    "",
    "A simple way to explain Winsalot is:",
    '"Winsalot Corp. acts as an outsourced B2B prospecting and appointment-setting team. They identify businesses that may need your service, conduct the outbound outreach, qualify interest, and help create appointments so your team can focus on closing the opportunities."',
    "",
    "2. Business Lending Support",
    "",
    "Winsalot Corp. also assists eligible businesses that are looking for commercial financing.",
    "We work with lending and funding partners and help businesses explore suitable financing options based on their revenue, operating history, financial profile, and lender requirements.",
    "",
    "Winsalot does not charge the business a separate fee for this support. Compensation is generally paid by the applicable lender or funding partner when a transaction successfully funds.",
    "Funding approval, amount, pricing, repayment terms, and eligibility are determined by the lender.",
    "",
    "How to Position Business Lending",
    "",
    "You can say:",
    '"Winsalot Corp. also works with business funding partners and can help eligible businesses explore commercial financing options without having to approach multiple lenders on their own."',
    "",
    "Your Role as a Referral Partner",
    "",
    "Your main role is to identify businesses that may benefit from either service, introduce Winsalot, and connect interested prospects with us.",
    "You do not need to handle the full sales presentation, underwriting, campaign setup, or onboarding. Winsalot will take over once the prospect is interested.",
    "Please avoid guaranteeing appointments, sales conversions, financing approvals, funding amounts, or specific financing terms.",
    "",
    "We are looking forward to building the partnership and helping you create additional value for the businesses you already work with.",
    "",
    "Best regards,",
    "C.J. Amadi",
    "Winsalot Corp.",
    "Empowering Businesses, One Solution at a Time.",
  ];

  return {
    subject: "Winsalot Corp. Services & Key Selling Points",
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

// Sends the partner's currently-saved Services & Selling Points draft -
// same review-before-send, compare-and-swap-claim shape as
// sendPartnerOverviewEmail above, targeting the separate services_email_*
// columns so sending this template can never touch the Partnership
// Overview template's own status/sent_at.
export async function sendServicesSellingPointsEmail(
  admin: SupabaseClient,
  partner: Pick<SubcontractorProfileRow, "id" | "email" | "services_email_subject" | "services_email_body">
): Promise<PartnerOverviewEmailSendResult> {
  if (!partner.email) return { status: "failed", error: "No recipient email on file for this partner." };
  if (!partner.services_email_subject || !partner.services_email_body) {
    return { status: "failed", error: "No email draft has been generated for this partner yet." };
  }

  const { data: claimed, error: claimError } = await admin
    .from("crm_subcontractors")
    .update({ services_email_status: "sending" })
    .eq("id", partner.id)
    .in("services_email_status", ["not_sent", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) return { status: "failed", error: claimError.message };
  if (!claimed) return { status: "failed", error: "This email has already been sent or is currently sending." };

  const subject = partner.services_email_subject;
  const text = partner.services_email_body;
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
      await admin.from("crm_subcontractors").update({ services_email_status: "failed", services_email_error: errorDetail }).eq("id", partner.id);
      return { status: "failed", error: errorDetail };
    }

    await admin
      .from("crm_subcontractors")
      .update({
        services_email_status: "sent",
        services_email_sent_at: new Date().toISOString(),
        services_email_error: null,
      })
      .eq("id", partner.id);

    return { status: "sent", resendEmailId: sendResult.id };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : "Unknown error sending Services & Selling Points Email.";
    await admin.from("crm_subcontractors").update({ services_email_status: "failed", services_email_error: errorDetail }).eq("id", partner.id);
    return { status: "failed", error: errorDetail };
  }
}
