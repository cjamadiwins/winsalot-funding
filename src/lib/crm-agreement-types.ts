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

  service_type: AgreementServiceType;
  target_type: AgreementTargetType;
  monthly_target: number;
  monthly_fee: number;
  setup_fee: number | null;

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

  admin_reviewed_confirmation: boolean;

  signer_full_name: string | null;
  signer_job_title: string | null;
  signer_business_name: string | null;
  signer_accepted: boolean;
  signer_signature_text: string | null;

  sent_at: string | null;
  opened_at: string | null;
  accepted_at: string | null;
};

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

// Renders every template section for one agreement, substituting
// placeholders. The "monthly_target" section's body is fully replaced by
// buildAgreementTargetStatement() (rather than just token-substituted)
// so the exact required wording is guaranteed verbatim, byte for byte,
// regardless of what the template's own stored body text says - the
// template still carries a human-readable copy of it for the preview/
// legal-review screen, but this function is the single source of truth
// for what actually reaches the client.
export function renderAgreementTemplate(
  template: Pick<CrmAgreementTemplateRow, "content">,
  agreement: Pick<CrmClientAgreementRow, "service_type" | "target_type" | "monthly_target">
): RenderedAgreementSection[] {
  const replacements: Record<string, string> = {
    service_noun_singular: serviceNounSingular(agreement.service_type),
    service_noun_plural: serviceNounPlural(agreement.service_type),
    service_label: serviceLabel(agreement.service_type),
    monthly_target: String(agreement.monthly_target),
  };

  return template.content.map((section) => {
    if (section.key === "monthly_target") {
      return { ...section, body: buildAgreementTargetStatement(agreement) };
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

// The exact required Free Pilot Program disclosure paragraph (verbatim,
// no interpolation needed - it reads generically). Also baked directly
// into the seeded pilot template's own body (migration 0098) so the
// agreement preview/PDF/public sign page all show identical wording;
// exported here for reuse (e.g. the fee-summary badge) and for tests.
export const PILOT_PROGRAM_DISCLOSURE =
  "Winsalot Corp will provide this pilot program at no charge for the agreed period and scope. The agreed number of qualified leads or appointments is a target and not a guarantee. Results may vary based on market conditions, prospect availability, targeting criteria and the client's responsiveness. Winsalot Corp does not guarantee that a lead or appointment will result in a sale. The pilot will end on the stated end date unless both parties agree in writing to extend it or begin a paid monthly campaign.";

export const COMPLIMENTARY_PILOT_PROGRAM_LABEL = "Complimentary Pilot Program";

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
