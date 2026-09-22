// Growth CRM: Client Consultation Guide - static script/question copy and
// the shared types for crm_consultation_guides (see
// supabase/migrations/20260918182252_growth_crm_consultation_guide.sql).
// Admin-only for now per CJ's request. Kept as one self-contained file,
// same convention as growth-crm-campaign-scripts.ts, so the guide's
// wording can be reviewed/edited in one place without touching page code.

import type { CommercialArrangementFields } from "./commercial-arrangement";

export const CONSULTATION_GUIDE_STATUSES = ["draft", "completed"] as const;
export type ConsultationGuideStatus = (typeof CONSULTATION_GUIDE_STATUSES)[number];

export const CONSULTATION_GUIDE_STATUS_LABELS: Record<ConsultationGuideStatus, string> = {
  draft: "Draft",
  completed: "Completed",
};

export const CONSULTATION_GUIDE_STATUS_STYLES: Record<ConsultationGuideStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
};

export const LEADGEN_FIT_STATUSES = ["interested_now", "possible_future_fit", "not_a_fit"] as const;
export type LeadgenFitStatus = (typeof LEADGEN_FIT_STATUSES)[number];

export const LEADGEN_FIT_STATUS_LABELS: Record<LeadgenFitStatus, string> = {
  interested_now: "Interested now",
  possible_future_fit: "Possible future fit",
  not_a_fit: "Not a fit",
};

export const LENDING_FIT_STATUSES = ["interested_now", "possible_future_need", "not_applicable"] as const;
export type LendingFitStatus = (typeof LENDING_FIT_STATUSES)[number];

export const LENDING_FIT_STATUS_LABELS: Record<LendingFitStatus, string> = {
  interested_now: "Interested now",
  possible_future_need: "Possible future need",
  not_applicable: "Not applicable",
};

// The consultation's Service field - deliberately only 2 values, unlike
// crm_opportunities' 3-way OpportunityType (lead_generation /
// business_financing / both_services). A "both_services" appointment has
// no single correct answer here, so it's never auto-resolved to one value
// - Admin must choose explicitly before the consultation can be marked
// complete (per CJ's brief: "Do not guess the service from notes or other
// text").
export const CONSULTATION_GUIDE_SERVICES = ["lead_generation", "business_financing"] as const;
export type ConsultationGuideService = (typeof CONSULTATION_GUIDE_SERVICES)[number];

export const CONSULTATION_GUIDE_SERVICE_LABELS: Record<ConsultationGuideService, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Finance",
};

export const CONSULTATION_GUIDE_FOLLOW_UP_STATUSES = ["not_sent", "sending", "sent", "failed"] as const;
export type ConsultationGuideFollowUpStatus = (typeof CONSULTATION_GUIDE_FOLLOW_UP_STATUSES)[number];

export const CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS: Record<ConsultationGuideFollowUpStatus, string> = {
  not_sent: "Not Sent",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export const CONSULTATION_GUIDE_FOLLOW_UP_STATUS_STYLES: Record<ConsultationGuideFollowUpStatus, string> = {
  not_sent: "bg-slate-100 text-slate-600",
  sending: "bg-sky-100 text-sky-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};

// Which follow-up email template a guide's draft is generated from -
// independent of arrangement_type (Commercial Arrangement is about
// pricing/payment structure; this is about which prospect-specific email
// copy is used, e.g. a prospect Winsalot needs portfolio/positioning
// material from before outreach, still at the standard $750/month rate).
// "standard" (the default for every existing and future guide unless
// explicitly changed) is the plain service-specific template
// buildConsultationGuideFollowUpEmail already builds - see
// consultation-guide-email.ts's buildFollowUpEmailDraft for where this
// branches. Scoped, per-prospect templates are added here one at a time,
// never altering "standard" or any other prospect's generated email.
export const CONSULTATION_GUIDE_FOLLOW_UP_EMAIL_TEMPLATES = ["standard", "pricing_next_steps"] as const;
export type ConsultationGuideFollowUpEmailTemplate = (typeof CONSULTATION_GUIDE_FOLLOW_UP_EMAIL_TEMPLATES)[number];

export const CONSULTATION_GUIDE_FOLLOW_UP_EMAIL_TEMPLATE_LABELS: Record<ConsultationGuideFollowUpEmailTemplate, string> = {
  standard: "Standard",
  pricing_next_steps: "Pricing & Next Steps",
};

// Shown as an internal-only banner above the Send Email button in the
// Follow-Up Email section (ConsultationGuideForm.tsx) whenever
// follow_up_email_template === "pricing_next_steps" - never persisted
// into follow_up_email_subject/body, so it can never end up in the actual
// customer email. A plain client-safe string builder (this file has no
// "server-only" import, unlike consultation-guide-email.ts) since the
// form that renders it is a Client Component.
export function buildPricingNextStepsInternalWarning(businessName: string): string {
  return `Before sending: Confirm the ${businessName} consultation details are correct. The standard Lead Generation rate is $750/month. Do not mention a pilot, discount, or custom arrangement unless separately approved by Admin.`;
}

// Section 2: Start the Conversation.
export const CONSULTATION_GUIDE_OPENING_LINE =
  "Thanks for meeting with me. I’d like to understand your business, your growth goals, what you’re doing now to win customers, and where you need the most support. Then I can explain where Winsalot Corp. may be able to help.";

// Section 3: What Winsalot Corp. Provides & Client Benefits.
export const CONSULTATION_GUIDE_VALUE_SECTIONS: {
  title: string;
  provides: string[];
  benefits: string[];
}[] = [
  {
    title: "Lead Generation & Outbound Appointment Setting",
    provides: [
      "A customized B2B outbound campaign built around the client’s industry, offer, target market, decision-maker, qualification criteria, and desired call-to-action.",
      "Our team conducts outbound prospecting, speaks with businesses, identifies interest, qualifies opportunities, books appointments or consultations, and records useful call notes and outcomes.",
    ],
    benefits: [
      "Consistent prospecting without having to build an internal calling team.",
      "More conversations with potential customers.",
      "Saves the client’s sales or operations team time.",
      "Helps create a steady outbound business-development process.",
      "Better visibility into campaign activity and opportunities.",
    ],
  },
  {
    title: "Campaign Setup & Ongoing Support",
    provides: [
      "Target-market planning.",
      "Customized calling scripts based on the client’s industry and service.",
      "Campaign instructions for agents.",
      "Prospect follow-up.",
      "Call logs and notes.",
      "Appointment tracking.",
      "CRM reporting where applicable.",
    ],
    benefits: [
      "Campaign messaging reflects the client’s actual business and offer.",
      "Agents have clear instructions about who to target and what to say.",
      "More consistent outbound calls.",
      "Easier prospect follow-up.",
      "Better campaign accountability and visibility.",
    ],
  },
  {
    title: "Business Lending Support",
    provides: [
      "We help eligible businesses explore financing through our lending partners, organize information required for review, submit opportunities to appropriate lenders, and help clients understand available offers when received.",
    ],
    benefits: [
      "Access to multiple lending relationships through one point of contact.",
      "Guidance throughout the application process.",
      "Less time spent approaching individual lenders.",
      "Support understanding available financing options.",
      "Winsalot Corp. does not charge the business a separate lending-support fee; compensation is generally paid by the lender when funding closes.",
    ],
  },
];

export const CONSULTATION_GUIDE_VALUE_DISCLAIMER =
  "Important: Winsalot Corp. does not guarantee lead volume, sales, lender approval, rates, terms, or funding amounts. The consultation should focus on confirming fit, expectations, target market, campaign requirements, and the appropriate next step.";

// Section 4: Business & Growth Discovery.
export const CONSULTATION_GUIDE_DISCOVERY_QUESTIONS = [
  { key: "main_services", label: "Tell me about your business and the main services or products you want to grow." },
  { key: "ideal_customer", label: "Who is your ideal customer? Include industry, company size, location, and decision-maker." },
  { key: "growth_goals", label: "What are your top growth goals over the next 3–6 months?" },
  { key: "current_marketing", label: "How are you currently generating new business?" },
  { key: "whats_working", label: "What is working well today and what is not working?" },
  { key: "biggest_challenge", label: "What is the biggest challenge preventing you from getting more customers right now?" },
] as const;

// Section 5: Lead Generation / Appointment-Setting Fit.
export const CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS = [
  { key: "campaign_service", label: "Which service should our outbound campaign promote?" },
  { key: "target_industries", label: "Which industries or business types should we target?" },
  { key: "target_locations", label: "Which cities, provinces, or territories should we focus on?" },
  { key: "right_contact", label: "Who is the right person for our agents to speak with?" },
  { key: "differentiator", label: "What makes the prospect’s offer different from competitors?" },
  { key: "call_to_action", label: "What should the call-to-action be: consultation, quote, demo, estimate, or another next step?" },
  { key: "qualification_questions", label: "What questions should agents use to qualify the opportunity before booking?" },
  { key: "exclusions", label: "Are there businesses, industries, locations, or prospects that should be excluded?" },
] as const;

export const CONSULTATION_GUIDE_INTERNAL_REMINDER =
  "INTERNAL CONSULTATION REMINDER — Standard Lead Generation fee: $750/month. Do not offer or mention a pilot program unless approved by Admin. Focus first on business fit, campaign goals, target market, and the prospect’s requested service details. This reminder must never be shown to clients.";

// Section 6: Campaign Expectations & Handoff.
export const CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS = [
  { key: "followup_speed", label: "How quickly can the client follow up after an appointment or interested prospect is generated?" },
  { key: "appointment_recipient", label: "Who will receive appointments and follow-ups?" },
  { key: "call_notes_info", label: "What information should be captured in call notes?" },
  { key: "call_logs_recording", label: "Does the client require call logs and call-recording access where available?" },
  { key: "first_month_success", label: "What would make the first month successful for the client?" },
] as const;

// Section 7: Business Lending Support Fit.
export const CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS = [
  { key: "financing_purpose", label: "What is the purpose of the financing?" },
  { key: "funding_amount", label: "Approximately how much funding is being requested?" },
  { key: "time_in_business", label: "How long has the business been operating?" },
  { key: "monthly_revenue", label: "What is the approximate monthly business revenue?" },
  { key: "bank_statements", label: "Are business bank statements available if requested by a lender?" },
  { key: "funding_timeline", label: "How soon is the funding needed?" },
] as const;

export const CONSULTATION_GUIDE_LENDING_WARNING =
  "Do not promise an approval, rate, term, or funding amount. Eligibility and offers are determined by the lender after review.";

// Section 8: Consultation Summary.
export const CONSULTATION_GUIDE_SUMMARY_FIELDS = [
  { key: "primary_need", label: "Primary need" },
  { key: "recommended_service", label: "Recommended service" },
  { key: "target_market", label: "Target market / audience" },
  { key: "qualification_criteria", label: "Key qualification criteria" },
  { key: "next_step", label: "Next step agreed" },
  { key: "follow_up_date", label: "Follow-up date" },
] as const;

// Section 10: Close the Consultation (section 9 is Commercial Arrangement
// / Special Terms - see src/lib/commercial-arrangement.ts - added between
// Consultation Summary and this section).
export const CONSULTATION_GUIDE_CLOSING_LINE =
  "Based on what you’ve shared, the next step is for us to confirm the campaign/service details and make sure expectations are clear. I’ll summarize what we discussed and send the appropriate next-step information.";

// Section 11: Final Checklist.
export const CONSULTATION_GUIDE_CHECKLIST_ITEMS = [
  { key: "confirmed_goal_and_need", label: "Confirmed the client’s main business goal and service need" },
  { key: "confirmed_target_decision_maker", label: "Confirmed target industry, location, and decision-maker" },
  { key: "confirmed_qualification_and_cta", label: "Confirmed qualification criteria and desired call-to-action" },
  { key: "confirmed_appointment_handler", label: "Confirmed who will handle appointments/follow-ups" },
  { key: "explained_promises", label: "Explained what Winsalot Corp. will and will not promise" },
  { key: "agreed_next_step", label: "Agreed on a clear next step and follow-up date" },
  { key: "entered_notes", label: "Entered consultation notes into the Growth CRM" },
] as const;

export type ConsultationGuideAnswers = Record<string, string>;
export type ConsultationGuideChecklist = Record<string, boolean>;

export type CrmConsultationGuideRow = CommercialArrangementFields & {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  opportunity_id: string | null;

  status: ConsultationGuideStatus;
  completed_at: string | null;
  completed_by: string | null;
  // Set on every save (including editing an already-completed guide) -
  // separate from created_by, which never changes after the first save.
  updated_by: string | null;

  // Set when this guide was opened from an existing booked appointment
  // (?appointmentId=... on /new) - null for a manual consultation.
  appointment_id: string | null;
  service: ConsultationGuideService | null;

  // Always describes the *original* send, from the first successful
  // manual "Send Follow-Up Email" (or the first successful Retry after
  // one failed) - a later deliberate Resend (see
  // follow_up_email_resend_count below) never changes these, by design
  // ("preserve the original recipient, template, send time and delivery
  // status"). Marking a consultation Completed never sets this to
  // anything but its 'not_sent' default - completion only generates the
  // draft below for review.
  follow_up_email_status: ConsultationGuideFollowUpStatus;
  follow_up_email_sent_at: string | null;
  // The service the sent template actually matched, captured at send time
  // - kept separate from `service` above since that field can still be
  // edited after completion.
  follow_up_email_service: ConsultationGuideService | null;
  follow_up_email_error: string | null;
  follow_up_crm_lead_email_id: string | null;
  // Set to "No recipient email" when completed without a recipient
  // address on file; null whenever a send was attempted.
  no_follow_up_email_reason: string | null;

  // The reviewable, Admin-editable draft ("Edit Email") that Send/Resend
  // actually sends verbatim - generated once automatically the moment the
  // consultation is marked Completed (see buildFollowUpEmailDraft in
  // consultation-guide-email.ts), and on-demand for any older guide that
  // doesn't have one yet (e.g. one completed via a direct data migration
  // before this feature existed). Null only until a draft has been
  // generated.
  follow_up_email_subject: string | null;
  follow_up_email_body: string | null;
  // Which template generated (and will regenerate, if ever backfilled)
  // this draft - see CONSULTATION_GUIDE_FOLLOW_UP_EMAIL_TEMPLATES above.
  // Null/"standard" for every guide except one explicitly switched to a
  // scoped, prospect-specific template.
  follow_up_email_template: ConsultationGuideFollowUpEmailTemplate | null;

  // A deliberate, admin-confirmed "Resend Follow-Up Email" of the same
  // template to the same recipient - only ever offered once the original
  // send above already succeeded (see resendConsultationFollowUpEmailAction
  // in actions.ts). Purely additive bookkeeping for "how many times, and
  // when/by whom most recently" - never overwrites the original send
  // columns above.
  follow_up_email_resend_count: number;
  follow_up_email_last_resent_at: string | null;
  follow_up_email_last_resent_by: string | null;
  follow_up_email_last_resend_error: string | null;

  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  location: string | null;
  consultation_date: string | null;
  consultant_name: string | null;

  discovery: ConsultationGuideAnswers;

  leadgen_fit_status: LeadgenFitStatus | null;
  leadgen_fit: ConsultationGuideAnswers;

  campaign_expectations: ConsultationGuideAnswers;

  lending_fit_status: LendingFitStatus | null;
  lending_fit: ConsultationGuideAnswers;

  summary: ConsultationGuideAnswers;
  checklist: ConsultationGuideChecklist;

  notes: string | null;
};

// List row shape for the /admin/consultation-guide index - only what that
// table needs, joined against the linked opportunity's business name for
// a consultation opened without one being obvious from its own columns.
export type ConsultationGuideListRow = Pick<
  CrmConsultationGuideRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "status"
  | "business_name"
  | "contact_name"
  | "consultation_date"
  | "consultant_name"
  | "opportunity_id"
  | "appointment_id"
  | "service"
  | "follow_up_email_status"
> & {
  opportunityBusinessName: string | null;
};
