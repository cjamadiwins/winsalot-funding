// Winsalot Growth CRM: admin-only Client Onboarding workflow types and
// pure logic (crm_agreement_*/crm_intake_*, migration 0097). See that
// migration's header comment for the full design rationale - reuses
// crm_clients/crm_opportunities rather than duplicating them, and keeps
// the lightweight invoice/payment tracker here fully separate from the
// existing crm_invoices system.
//
// The Free Pilot Program option (migration 0098) is a second branch
// through this same schema, distinguished by campaign_type on
// crm_client_agreements - see that migration's header comment.
//
// The Manage action (migration 0099) adds admin Edit/Delete on top of
// this same schema - see that migration's header comment for which
// fields stay locked once a record is signed and why.

export const AGREEMENT_STATUSES = ["draft", "sent", "signed", "superseded", "archived"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const AGREEMENT_SERVICE_TYPES = ["qualified_leads", "consultation_appointments"] as const;
export type AgreementServiceType = (typeof AGREEMENT_SERVICE_TYPES)[number];

export const AGREEMENT_SERVICE_TYPE_LABELS: Record<AgreementServiceType, string> = {
  qualified_leads: "Qualified Leads",
  consultation_appointments: "Consultation Appointments",
};

export const AGREEMENT_TARGET_TYPES = ["monthly_target", "guaranteed"] as const;
export type AgreementTargetType = (typeof AGREEMENT_TARGET_TYPES)[number];

export const AGREEMENT_BILLING_FREQUENCIES = ["monthly", "quarterly", "annually"] as const;
export type AgreementBillingFrequency = (typeof AGREEMENT_BILLING_FREQUENCIES)[number];

export const INVOICE_TRACKER_STATUSES = ["not_sent", "sent", "payment_pending", "payment_received"] as const;
export type InvoiceTrackerStatus = (typeof INVOICE_TRACKER_STATUSES)[number];

export const INVOICE_TRACKER_STATUS_LABELS: Record<InvoiceTrackerStatus, string> = {
  not_sent: "Invoice Not Sent",
  sent: "Invoice Sent",
  payment_pending: "Payment Pending",
  payment_received: "Payment Received",
};

export const INTAKE_CONFIG_STATUSES = ["draft", "sent"] as const;
export type IntakeConfigStatus = (typeof INTAKE_CONFIG_STATUSES)[number];

export const AGREEMENT_TEMPLATE_KINDS = ["client_service_agreement", "pilot_program_agreement"] as const;
export type AgreementTemplateKind = (typeof AGREEMENT_TEMPLATE_KINDS)[number];

export const CAMPAIGN_TYPES = ["standard_monthly", "free_pilot"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  standard_monthly: "Standard Monthly Campaign",
  free_pilot: "Free Pilot Program",
};

export const PILOT_STATUSES = ["not_started", "active", "results_review", "converted", "extended", "closed"] as const;
export type PilotStatus = (typeof PILOT_STATUSES)[number];

// A pilot (campaign_type = 'free_pilot') can now be either Free or Paid -
// deliberately a separate field from campaign_type rather than a rename
// of it, so every existing "free_pilot" row, constraint, and code path
// keeps its exact current meaning ("this is a pilot"); pilot_type is the
// new, narrower question of whether *this* pilot is charged for
// (migration 0144). Never confuse this with PilotStatus above - Pilot
// Status is the lifecycle (Active/Results Review/...), Pilot Type is
// purely financial and, once signed, locked like the fee fields
// themselves (see the guard trigger in migration 0144).
export const PILOT_TYPES = ["free", "paid"] as const;
export type PilotType = (typeof PILOT_TYPES)[number];

export const PILOT_TYPE_LABELS: Record<PilotType, string> = {
  free: "Free Pilot",
  paid: "Paid Pilot",
};

// A pilot's payment summary - deliberately independent of both
// PilotStatus (the lifecycle) and a linked invoice's own status (an
// invoice may not exist at all yet, or the admin may need to record
// "Waived" or "Not Required", neither of which any crm_invoices status
// value means) - the admin sets this directly (see
// updatePilotPaymentStatusAction). Standard (non-pilot) agreements never
// read this column; it stays at its harmless 'not_required' default for
// them.
export const PAYMENT_STATUSES = ["not_required", "pending", "paid", "partially_paid", "overdue", "waived"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_required: "Not Required",
  pending: "Pending",
  paid: "Paid",
  partially_paid: "Partially Paid",
  overdue: "Overdue",
  waived: "Waived",
};

export const AGREEMENT_CURRENCIES = ["CAD", "USD"] as const;
export type AgreementCurrency = (typeof AGREEMENT_CURRENCIES)[number];

// The Manage action's admin-only "Client Status" label (migration 0099) -
// a separate, purely informational tracking field. It is never read by
// deriveCrmOnboardingStage()/deriveCrmPilotStage() below and never
// decides which admin actions appear - that keeps being driven entirely
// by the real, derived stage, exactly as before this field existed.
export const CLIENT_MANUAL_STATUSES = ["Draft", "Pilot", "Active", "Completed", "Paused", "Cancelled"] as const;
export type ClientManualStatus = (typeof CLIENT_MANUAL_STATUSES)[number];

export type CrmAgreementTemplateRow = {
  id: string;
  created_at: string;
  updated_at: string;
  version: number;
  kind: AgreementTemplateKind;
  content: { key: string; title: string; body: string }[];
};

export type CrmClientAgreementRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  client_id: string;
  opportunity_id: string | null;
  template_id: string;

  version: number;
  supersedes_id: string | null;

  status: AgreementStatus;

  legal_business_name: string;
  contact_person: string;
  business_email: string;
  phone: string | null;

  service_type: AgreementServiceType;
  target_type: AgreementTargetType;
  monthly_target: number;
  monthly_fee: number;
  setup_fee: number | null;
  currency: AgreementCurrency;

  // Manage action's admin-only tracking label (migration 0099) - see
  // CLIENT_MANUAL_STATUSES above.
  manual_status: ClientManualStatus | null;

  target_industries: string[];
  target_locations: string[];

  campaign_start_date: string | null;
  billing_frequency: AgreementBillingFrequency;
  payment_due_terms: string | null;

  initial_term: string | null;
  renewal_terms: string | null;
  cancellation_terms: string | null;
  additional_notes: string | null;

  // Free Pilot Program fields - irrelevant/unused when campaign_type is
  // 'standard_monthly'. campaign_type is set once at creation and never
  // edited afterward (a new agreement/amendment is required instead - see
  // migration 0098's header comment). pilot_status tracks the pilot-only
  // lifecycle independently of the shared `status` column above.
  campaign_type: CampaignType;
  pilot_status: PilotStatus;
  pilot_duration: string | null;
  pilot_end_date: string | null;
  expected_call_volume: string | null;
  qualification_criteria: string | null;
  results_review_date: string | null;

  // Free-or-paid pilot fields (migration 0144) - pilot_type only ever
  // meaningful when campaign_type is 'free_pilot'; a Paid Pilot's actual
  // amounts still live in monthly_fee/setup_fee/currency above (reused,
  // not duplicated - see that migration's header comment). payment_status/
  // payment_due_date/invoice_id are never locked by the signed-guard
  // trigger, since payment happens after signing, exactly like
  // pilot_status above.
  pilot_type: PilotType;
  payment_status: PaymentStatus;
  payment_due_date: string | null;
  invoice_id: string | null;

  admin_reviewed_confirmation: boolean;

  signer_full_name: string | null;
  signer_job_title: string | null;
  signer_business_name: string | null;
  signer_accepted: boolean;
  signer_signature_text: string | null;

  sent_at: string | null;
  opened_at: string | null;
  accepted_at: string | null;

  // Human-readable identifier (migration 0102), same generated pattern as
  // crm_invoices.invoice_number. Tracks whether the admin's own "signed"
  // notification email actually sent - independent of the client-facing
  // sign-request email's own sent_at/opened_at above.
  agreement_number: string;
  admin_notified_at: string | null;
  admin_notification_failed_at: string | null;
  admin_notification_error: string | null;

  // Client Onboarding sidebar badge (migration 0145) - null means this
  // record hasn't been opened from the Onboarding dashboard yet. Distinct
  // from admin_reviewed_confirmation above and from crm_notifications'
  // is_read (Client Agreements' own badge source) - see that migration's
  // header comment for why these three never share a column.
  onboarding_reviewed_at: string | null;
};

// Whether an agreement's commercial/legal terms are locked - the single
// source of truth the Manage action's server actions and modal UI both
// use (migration 0099), so "what's editable" can never disagree between
// them. Mirrors the exact condition the crm_client_agreements_guard_signed()
// database trigger enforces: once a client has actually signed
// (accepted_at is set), those terms are immutable - only Convert/Extend
// (a brand-new agreement) can change them. Contact info, phone, the
// manual Client Status label, and notes are never locked by this check.
export function isAgreementLocked(agreement: Pick<CrmClientAgreementRow, "accepted_at">): boolean {
  return agreement.accepted_at !== null;
}

// Single source of truth for the required admin-notification wording
// (in-app notification title and email subject/heading both use these,
// so they can never disagree).
export function signedAgreementNotificationTitle(businessName: string, agreementNumber: string): string {
  return `${businessName} signed agreement ${agreementNumber}.`;
}

export function intakeSubmittedNotificationTitle(businessName: string): string {
  return `${businessName} submitted their client intake form.`;
}

export const AGREEMENT_EVENT_TYPES = [
  "created",
  "sent",
  "opened",
  "accepted",
  "resent",
  "superseded",
  "archived",
  "pdf_generated",
] as const;
export type AgreementEventType = (typeof AGREEMENT_EVENT_TYPES)[number];

export type CrmAgreementEventRow = {
  id: string;
  agreement_id: string;
  event_type: AgreementEventType;
  actor_type: "admin" | "client" | "system";
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
};

export type CrmAgreementInvoiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  agreement_id: string;
  client_id: string;
  invoice_number: string;
  invoice_amount: number;
  date_sent: string | null;
  payment_due_date: string | null;
  status: InvoiceTrackerStatus;
  paid_at: string | null;
};

// Pilot results dashboard - one row per pilot agreement, admin-editable
// at any time (not gated by the signed-agreement immutability trigger,
// since results are recorded during/after the pilot runs).
export type CrmPilotResultsRow = {
  id: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  agreement_id: string;
  calls_completed: number | null;
  decision_makers_reached: number | null;
  interested_prospects: number | null;
  information_emails_sent: number | null;
  qualified_leads: number | null;
  appointments_booked: number | null;
  common_objections: string | null;
  market_response: string | null;
  admin_recommendation: string | null;
};

// A custom, admin-editable intake question - see item 8's list (services
// to promote, ideal customer, target industries, etc). Deliberately does
// NOT include the 7 agreement-locked fields (item 6/7) - those are never
// stored as questions, only read live off the agreement at render time,
// which is what makes them impossible for a client to edit.
export type CrmIntakeQuestion = {
  key: string;
  label: string;
  type: "short_text" | "long_text" | "select" | "multi_select" | "date";
  options?: string[];
  required: boolean;
};

export const DEFAULT_INTAKE_QUESTIONS: CrmIntakeQuestion[] = [
  { key: "services_to_promote", label: "Services or Products to Promote", type: "long_text", required: true },
  { key: "ideal_customer", label: "Ideal Customer", type: "long_text", required: false },
  { key: "target_customer_types", label: "Target Customer Types", type: "long_text", required: false },
  { key: "qualification_requirements", label: "Qualification Requirements", type: "long_text", required: false },
  { key: "preferred_appointment_times", label: "Preferred Appointment Days and Times", type: "long_text", required: false },
  { key: "booking_link", label: "Booking Link", type: "short_text", required: false },
  { key: "excluded_industries_locations", label: "Excluded Industries or Locations", type: "long_text", required: false },
  { key: "sales_messaging", label: "Sales Messaging", type: "long_text", required: false },
  { key: "special_instructions", label: "Special Instructions", type: "long_text", required: false },
  { key: "preferred_start_date", label: "Preferred Start Date", type: "date", required: false },
  { key: "additional_notes", label: "Additional Notes", type: "long_text", required: false },
  { key: "required_documents", label: "Required Documents", type: "long_text", required: false },
];

export type CrmIntakeConfigRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  client_id: string;
  agreement_id: string;
  opportunity_id: string | null;
  status: IntakeConfigStatus;
  questions: CrmIntakeQuestion[];
  sent_at: string | null;
};

export type CrmIntakeSubmissionRow = {
  id: string;
  created_at: string;
  intake_config_id: string;
  client_id: string;
  agreement_id: string;
  opportunity_id: string | null;
  answers: Record<string, string>;
  corrected_answers: Record<string, string> | null;
  submitted_at: string;

  // Tracks whether the admin's own "intake submitted" notification email
  // actually sent (migration 0102) - independent of submitted_at above.
  admin_notified_at: string | null;
  admin_notification_failed_at: string | null;
  admin_notification_error: string | null;
};

export type CrmIntakeSubmissionEditRow = {
  id: string;
  submission_id: string;
  changed_by: string | null;
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------
// Template rendering - fills {{placeholder}} tokens with per-agreement
// values. Kept as a pure function so it's testable without a database
// and so the agreement preview screen and the PDF (crm-agreement-pdf.tsx)
// can never disagree about wording - both call this same function.
// ---------------------------------------------------------------------
function serviceNounSingular(serviceType: AgreementServiceType): string {
  return serviceType === "consultation_appointments" ? "appointment" : "lead";
}

function serviceNounPlural(serviceType: AgreementServiceType): string {
  return serviceType === "consultation_appointments" ? "consultation appointments" : "leads";
}

function serviceLabel(serviceType: AgreementServiceType): string {
  return AGREEMENT_SERVICE_TYPE_LABELS[serviceType];
}

// The exact required guarantee/disclosure sentence (brief section 3),
// with "monthly target" language unless the admin has deliberately
// selected "Guaranteed" for target_type.
export function buildAgreementTargetStatement(agreement: Pick<CrmClientAgreementRow, "service_type" | "target_type" | "monthly_target">): string {
  const noun = serviceNounPlural(agreement.service_type);
  const verb = agreement.target_type === "guaranteed" ? "guarantee" : "target";
  return `Winsalot Corp will ${verb} ${agreement.monthly_target} qualified ${noun} per month. Results may vary based on market conditions, prospect availability, targeting criteria and the client's responsiveness. Winsalot Corp does not guarantee that a lead or appointment will result in a sale.`;
}

export type RenderedAgreementSection = { key: string; title: string; body: string };

// Whether a pilot agreement is a Paid Pilot - the single source of truth
// every pilot-fee display (admin preview, PDF, public sign page, emails)
// uses so none of them can disagree. A standard (non-pilot) agreement is
// never "paid pilot" regardless of its own pilot_type value (which stays
// at its harmless default for those rows).
export function isPaidPilot(agreement: Pick<CrmClientAgreementRow, "campaign_type" | "pilot_type">): boolean {
  return agreement.campaign_type === "free_pilot" && agreement.pilot_type === "paid";
}

// Pilot Fee + Setup Fee - the one place this addition happens, so the
// admin preview, PDF, sign page, and invoice pre-fill can never compute a
// different total from the same agreement.
export function pilotTotalCost(agreement: Pick<CrmClientAgreementRow, "monthly_fee" | "setup_fee">): number {
  return Number(agreement.monthly_fee) + Number(agreement.setup_fee ?? 0);
}

// The document title used everywhere a pilot's own program type is named
// (admin badge, PDF title, public sign page heading, outbound emails) -
// never calls a Paid Pilot "complimentary", and never calls a Free Pilot
// anything but complimentary, so wording can't silently drift stale if a
// pilot is later converted from one to the other (a new agreement version
// re-derives this fresh from its own pilot_type every time).
export const COMPLIMENTARY_PILOT_PROGRAM_LABEL = "Complimentary Pilot Program";
export const PAID_PILOT_PROGRAM_LABEL = "Paid Pilot Program";

export function pilotProgramLabel(agreement: Pick<CrmClientAgreementRow, "pilot_type">): string {
  return agreement.pilot_type === "paid" ? PAID_PILOT_PROGRAM_LABEL : COMPLIMENTARY_PILOT_PROGRAM_LABEL;
}

// Dynamic "Pilot Fees" section body (spec: "Replace the existing 'Fees'
// section with dynamic wording based on the selected pilot type" / "Do
// not leave any hardcoded '$0' wording if the pilot is paid") - the only
// place this wording is generated, so the admin preview, PDF, and public
// sign page can never show three different numbers for the same pilot.
// A standard (non-pilot) agreement never calls this - it keeps using its
// own template-stored Fees wording untouched.
export function buildPilotFeesStatement(
  agreement: Pick<CrmClientAgreementRow, "pilot_type" | "monthly_fee" | "setup_fee" | "currency">
): string {
  const setupFee = Number(agreement.setup_fee ?? 0);
  if (agreement.pilot_type === "paid") {
    const pilotFee = Number(agreement.monthly_fee);
    const total = pilotFee + setupFee;
    return [
      "This is a paid pilot program.",
      "",
      `Pilot Fee: $${pilotFee.toLocaleString()}`,
      `Setup Fee: $${setupFee.toLocaleString()}`,
      `Total Pilot Cost: $${total.toLocaleString()}`,
      `Currency: ${agreement.currency}`,
      "",
      "Payment terms will follow the amount and due date stated in this pilot agreement or invoice.",
    ].join("\n");
  }
  return [
    "This pilot program is being provided at no charge for the agreed pilot scope and period.",
    "",
    "Pilot Fee: $0",
    `Setup Fee: $${setupFee.toLocaleString()}`,
    "",
    "Any services requested outside the agreed pilot scope may require separate approval and pricing.",
  ].join("\n");
}

// Dynamic "Pilot Program Scope" section body - the seeded pilot template
// (migration 0098) originally described every pilot as "a complimentary,
// time-limited pilot program"; that claim is only ever true for a Free
// Pilot, so this function is the one place that wording is generated,
// exactly like buildPilotFeesStatement above, rather than left as static
// template text a Paid Pilot's agreement would otherwise inherit
// unchanged.
export function buildPilotServicesStatement(agreement: Pick<CrmClientAgreementRow, "pilot_type" | "service_type">): string {
  const descriptor = agreement.pilot_type === "paid" ? "a" : "a complimentary,";
  return `Winsalot Corp will provide ${descriptor} time-limited pilot program to the Client, consisting of prospecting, outreach, and qualification activities directed at the Client's target industries and locations, for the purpose of generating ${serviceNounPlural(agreement.service_type)} on the Client's behalf, for the agreed pilot duration and scope set out in this Agreement.`;
}

// Renders every template section for one agreement, substituting
// placeholders. The "monthly_target" section's body is fully replaced by
// buildAgreementTargetStatement() (rather than just token-substituted)
// so the exact required wording is guaranteed verbatim, byte for byte,
// regardless of what the template's own stored body text says - the
// template still carries a human-readable copy of it for the preview/
// legal-review screen, but this function is the single source of truth
// for what actually reaches the client. A pilot's "fees" and "services"
// sections are likewise always fully replaced by buildPilotFeesStatement()/
// buildPilotServicesStatement() (never the template's own stored $0/
// "complimentary" wording), so a Paid Pilot's agreement never inherits a
// stale free-pilot claim - see those functions' own comments.
export function renderAgreementTemplate(
  template: Pick<CrmAgreementTemplateRow, "content">,
  agreement: Pick<CrmClientAgreementRow, "service_type" | "target_type" | "monthly_target" | "campaign_type" | "pilot_type" | "monthly_fee" | "setup_fee" | "currency">
): RenderedAgreementSection[] {
  const replacements: Record<string, string> = {
    service_noun_singular: serviceNounSingular(agreement.service_type),
    service_noun_plural: serviceNounPlural(agreement.service_type),
    service_label: serviceLabel(agreement.service_type),
    monthly_target: String(agreement.monthly_target),
  };
  const isPilot = agreement.campaign_type === "free_pilot";

  return template.content.map((section) => {
    if (section.key === "monthly_target") {
      return { ...section, body: buildAgreementTargetStatement(agreement) };
    }
    if (isPilot && section.key === "fees") {
      return { ...section, title: "Pilot Fees", body: buildPilotFeesStatement(agreement) };
    }
    if (isPilot && section.key === "services") {
      return { ...section, body: buildPilotServicesStatement(agreement) };
    }
    const body = section.body.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => replacements[token] ?? `{{${token}}}`);
    return { ...section, title: section.title.replace(/\{\{(\w+)\}\}/g, (_m, t: string) => replacements[t] ?? `{{${t}}}`), body };
  });
}

// Item 7's exact conditional wording for the locked target field on the
// public intake form. A pilot's target is for the whole pilot period, not
// "per month", so it gets its own wording when campaignType is passed as
// 'free_pilot' (the standard, brief-mandated wording is unchanged when
// campaignType is omitted or 'standard_monthly').
export function agreedTargetLabel(serviceType: AgreementServiceType, campaignType: CampaignType = "standard_monthly"): string {
  if (campaignType === "free_pilot") {
    return serviceType === "consultation_appointments" ? "Agreed Consultation Appointments (Pilot Target)" : "Agreed Qualified Leads (Pilot Target)";
  }
  return serviceType === "consultation_appointments" ? "Agreed Consultation Appointments Per Month" : "Agreed Qualified Leads Per Month";
}

export const AGREED_TARGET_NOTICE =
  "This target is based on your signed service agreement. Please contact Winsalot Corp if a change is required.";

export const PILOT_TARGET_NOTICE =
  "This target is based on your signed pilot program agreement. Please contact Winsalot Corp if a change is required.";

// The required Pilot Terms and No Guarantee disclosure (migration 0144) -
// deliberately written to work for BOTH a Free Pilot and a Paid Pilot
// (never claims the pilot is free, never says "at no charge"), replacing
// the old free-only wording that assumed every pilot was complimentary.
// Also baked directly into the seeded pilot template's own body (migration
// 0098) so the agreement preview/PDF/public sign page all show identical
// wording; exported here for reuse and for tests.
export const PILOT_PROGRAM_DISCLOSURE = [
  "Winsalot Corp will provide the pilot services for the agreed period, scope, target market, and deliverables.",
  "",
  "A pilot program is intended to test campaign performance and service fit.",
  "",
  "Winsalot Corp does not guarantee a specific number of sales, closed deals, revenue, funding approvals, or customer conversions unless a specific deliverable is expressly stated in the agreement.",
  "",
  "Where the pilot includes a defined target number of leads or appointments, Winsalot Corp will work toward that agreed target during the pilot period.",
  "",
  "At the end of the pilot, both parties may review the results and decide whether to continue, extend, modify, or end the service.",
].join("\n");

// ---------------------------------------------------------------------
// Onboarding stage - derived, never stored (see migration 0097's header
// comment and the plan this implements). Walks the required pipeline in
// order; each stage's precondition includes every earlier stage's, so
// exactly one stage is ever returned.
// ---------------------------------------------------------------------
export const ONBOARDING_STAGES = [
  "Client Agreed",
  "Agreement Draft",
  "Agreement Sent",
  "Agreement Signed",
  "Intake Form Customized and Sent",
  "Intake Received",
  "Invoice Sent",
  "Payment Received",
  "Campaign Active",
] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export function deriveCrmOnboardingStage(input: {
  agreement: Pick<CrmClientAgreementRow, "status"> | null;
  intakeConfig: Pick<CrmIntakeConfigRow, "status"> | null;
  submission: Pick<CrmIntakeSubmissionRow, "id"> | null;
  invoice: Pick<CrmAgreementInvoiceRow, "status"> | null;
  clientStatus: string;
}): OnboardingStage {
  const { agreement, intakeConfig, submission, invoice, clientStatus } = input;

  if (clientStatus === "Active") return "Campaign Active";
  if (invoice?.status === "payment_received") return "Payment Received";
  if (invoice?.status === "sent" || invoice?.status === "payment_pending") return "Invoice Sent";
  if (submission) return "Intake Received";
  if (intakeConfig?.status === "sent") return "Intake Form Customized and Sent";
  if (agreement?.status === "signed") return "Agreement Signed";
  if (agreement?.status === "sent") return "Agreement Sent";
  if (agreement?.status === "draft") return "Agreement Draft";
  return "Client Agreed";
}

// Human-readable "what to do next" for the onboarding dashboard,
// mirroring deriveCrmOnboardingStage's own precedence so the two can
// never disagree about where a client actually stands.
export function nextRequiredAction(stage: OnboardingStage): string {
  switch (stage) {
    case "Client Agreed":
      return "Create the agreement";
    case "Agreement Draft":
      return "Review and send the agreement";
    case "Agreement Sent":
      return "Waiting for the client to sign";
    case "Agreement Signed":
      return "Customize and send the intake form";
    case "Intake Form Customized and Sent":
      return "Waiting for the client to submit the intake form";
    case "Intake Received":
      return "Record the invoice";
    case "Invoice Sent":
      return "Mark payment received once paid";
    case "Payment Received":
      return "Activate the campaign";
    case "Campaign Active":
      return "None - onboarding complete";
  }
}

// ---------------------------------------------------------------------
// Free Pilot Program stage - derived, never stored, same "walk the
// required pipeline in order" style as deriveCrmOnboardingStage above
// (migration 0098's header comment). pilot_status only ever advances
// forward (not_started -> active -> results_review -> converted/
// extended/closed), so those states short-circuit first; below that, the
// stage falls back to the shared agreement/intake state exactly like the
// standard pipeline does, since a pilot walks the very same draft/sent/
// signed + intake-config/submission machinery before pilot_status ever
// starts moving.
// ---------------------------------------------------------------------
export const PILOT_STAGES = [
  "Pilot Agreed",
  "Pilot Agreement Signed",
  "Intake Form Sent",
  "Intake Received",
  "Pilot Active",
  "Results Review",
  "Converted to Paid Campaign",
  "Pilot Extended",
  "Pilot Closed",
] as const;
export type PilotStage = (typeof PILOT_STAGES)[number];

export function deriveCrmPilotStage(input: {
  agreement: Pick<CrmClientAgreementRow, "status" | "pilot_status">;
  intakeConfig: Pick<CrmIntakeConfigRow, "status"> | null;
  submission: Pick<CrmIntakeSubmissionRow, "id"> | null;
}): PilotStage {
  const { agreement, intakeConfig, submission } = input;

  if (agreement.pilot_status === "converted") return "Converted to Paid Campaign";
  if (agreement.pilot_status === "extended") return "Pilot Extended";
  if (agreement.pilot_status === "closed") return "Pilot Closed";
  if (agreement.pilot_status === "results_review") return "Results Review";
  if (agreement.pilot_status === "active") return "Pilot Active";
  if (submission) return "Intake Received";
  if (intakeConfig?.status === "sent") return "Intake Form Sent";
  if (agreement.status === "signed") return "Pilot Agreement Signed";
  return "Pilot Agreed";
}

// Human-readable "what to do next" for a pilot row on the onboarding
// dashboard, mirroring deriveCrmPilotStage's own precedence.
export function nextRequiredPilotAction(stage: PilotStage): string {
  switch (stage) {
    case "Pilot Agreed":
      return "Review and send the pilot agreement";
    case "Pilot Agreement Signed":
      return "Customize and send the intake form";
    case "Intake Form Sent":
      return "Waiting for the client to submit the intake form";
    case "Intake Received":
      return "Activate the pilot";
    case "Pilot Active":
      return "Start results review once the pilot period ends";
    case "Results Review":
      return "Convert to a paid campaign, extend the pilot, or close it";
    case "Converted to Paid Campaign":
      return "Continue onboarding on the new paid agreement";
    case "Pilot Extended":
      return "Continue onboarding on the new pilot agreement";
    case "Pilot Closed":
      return "None - pilot closed";
  }
}

// ---------------------------------------------------------------------
// Conflict flagging (brief section 9): compares a submission's
// (corrected-or-original) answers against the signed agreement's own
// locked values wherever both describe the same concept, and returns
// which keys disagree. Pure and read-only - never writes anywhere, never
// changes the agreement.
// ---------------------------------------------------------------------
export type IntakeConflict = { fieldKey: string; agreementValue: string; intakeValue: string };

export function findIntakeAgreementConflicts(
  agreement: Pick<CrmClientAgreementRow, "campaign_start_date">,
  answers: Record<string, string>
): IntakeConflict[] {
  const conflicts: IntakeConflict[] = [];
  const preferredStart = answers["preferred_start_date"];
  if (preferredStart && agreement.campaign_start_date && preferredStart !== agreement.campaign_start_date) {
    conflicts.push({
      fieldKey: "preferred_start_date",
      agreementValue: agreement.campaign_start_date,
      intakeValue: preferredStart,
    });
  }
  return conflicts;
}
