// Growth CRM: Commercial Arrangement / Special Terms - a client's
// commercial structure for a campaign, beyond the default Standard
// Monthly fee (e.g. a Performance-Based Trial with no upfront fee, where
// the Winsalot service fee only becomes due once a Winsalot-generated
// prospect converts into a paying client). Shared by the Client
// Consultation Guide's own "9. Commercial Arrangement / Special Terms"
// section (crm_consultation_guides) and the linked business/prospect
// record's own "Commercial Arrangement" display (crm_opportunities) -
// same field names on both tables, since completing a consultation
// copies these straight across (see completeConsultationGuideAction)
// rather than making anyone re-type them.
//
// Every arrangement_* field is nullable/defaulted so a plain Standard
// Monthly client (the only kind that existed before this feature) is
// completely unaffected - see the migration for the exact defaults.

export const ARRANGEMENT_TYPES = ["standard_monthly", "performance_based_trial", "custom_arrangement", "custom_split_payment"] as const;
export type ArrangementType = (typeof ARRANGEMENT_TYPES)[number];

export const ARRANGEMENT_TYPE_LABELS: Record<ArrangementType, string> = {
  standard_monthly: "Standard Monthly",
  performance_based_trial: "Performance-Based Trial",
  custom_arrangement: "Custom Arrangement",
  custom_split_payment: "Custom – Split Payment / Performance Milestones",
};

// Both "custom" buckets get the compact "Custom Terms" badge on the
// consultation record (Section 9's header) - "make the custom arrangement
// visually noticeable" - performance_based_trial has its own established
// identity (its own banner/labeling already exists) so isn't included.
export function isCustomArrangementType(type: ArrangementType): boolean {
  return type === "custom_arrangement" || type === "custom_split_payment";
}

export const ARRANGEMENT_CAMPAIGN_STATUSES = [
  "pending_agreement",
  "pre_launch_onboarding",
  "ready_to_start",
  "active",
  "converted",
  "completed",
  "cancelled",
] as const;
export type ArrangementCampaignStatus = (typeof ARRANGEMENT_CAMPAIGN_STATUSES)[number];

export const ARRANGEMENT_CAMPAIGN_STATUS_LABELS: Record<ArrangementCampaignStatus, string> = {
  pending_agreement: "Pending Agreement",
  // Terms are agreed and onboarding/campaign prep is underway ahead of a
  // set launch date - between "Pending Agreement" and "Ready to Start"
  // (e.g. Teknokraft Canada Inc., preparing for its October 1, 2026 launch).
  pre_launch_onboarding: "Pre-Launch / Onboarding",
  ready_to_start: "Ready to Start",
  active: "Active",
  converted: "Converted",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ARRANGEMENT_CONVERSION_STATUSES = ["not_converted", "converted"] as const;
export type ArrangementConversionStatus = (typeof ARRANGEMENT_CONVERSION_STATUSES)[number];

export const ARRANGEMENT_CONVERSION_STATUS_LABELS: Record<ArrangementConversionStatus, string> = {
  not_converted: "Not Converted",
  converted: "Converted",
};

export const ARRANGEMENT_FEE_STATUSES = ["not_due", "due", "paid"] as const;
export type ArrangementFeeStatus = (typeof ARRANGEMENT_FEE_STATUSES)[number];

export const ARRANGEMENT_FEE_STATUS_LABELS: Record<ArrangementFeeStatus, string> = {
  not_due: "Not Due",
  due: "Due",
  paid: "Paid",
};

// Form/UI defaults shown the moment "Performance-Based Trial" is picked -
// never written to the database until the form is actually saved.
export const PERFORMANCE_BASED_TRIAL_DEFAULTS = {
  arrangement_standard_fee: 750,
  arrangement_upfront_payment: 0,
  arrangement_payment_trigger: "First Winsalot-generated prospect becomes a paying client.",
  arrangement_attribution_period: "60 days",
  arrangement_service: "B2B Lead Generation",
  arrangement_campaign_status: "pending_agreement" as ArrangementCampaignStatus,
  arrangement_conversion_status: "not_converted" as ArrangementConversionStatus,
  arrangement_fee_status: "not_due" as ArrangementFeeStatus,
  arrangement_special_terms: "No upfront fee. The $750 service fee becomes due when the first Winsalot-generated prospect converts into a paying client.",
};

// Form/UI defaults shown the moment "Custom – Split Payment / Performance
// Milestones" is picked - never written to the database until the form is
// actually saved. A client-specific FIRST-ENGAGEMENT arrangement only -
// never replaces Winsalot Corp.'s normal $750/month recurring pricing for
// other clients (see arrangement_standard_fee below, which this type
// reuses to mean "the ongoing renewal rate once the initial engagement,
// described by the other fields, is complete").
export const CUSTOM_SPLIT_PAYMENT_DEFAULTS = {
  arrangement_total_value: 750,
  arrangement_upfront_payment: 250,
  arrangement_milestone_1_amount: 250,
  arrangement_milestone_1_condition: "Upon the first successful client conversion generated through Winsalot Corp.",
  arrangement_milestone_2_amount: 250,
  arrangement_milestone_2_condition: "Upon the second successful client conversion generated through Winsalot Corp.",
  arrangement_payment_trigger: "A prospect sourced/generated by Winsalot Corp. who becomes a paying customer of the client.",
  arrangement_standard_fee: 750,
  arrangement_service: "B2B Lead Generation / Appointment Setting",
  arrangement_campaign_status: "pending_agreement" as ArrangementCampaignStatus,
  arrangement_conversion_status: "not_converted" as ArrangementConversionStatus,
  arrangement_fee_status: "not_due" as ArrangementFeeStatus,
  arrangement_special_terms:
    "Client-specific first-engagement arrangement only. Does not replace Winsalot Corp.'s standard $750/month pricing for other clients.",
};

// Internal-only - never included in a client-facing email or PDF unless
// an Admin explicitly opts in later. Shown as a compact banner on both
// the Commercial Arrangement guide section and the business record.
export const ARRANGEMENT_INTERNAL_COMPLIANCE_NOTE =
  "Winsalot Corp. generates and qualifies business opportunities but does not guarantee that a prospect will purchase or become a paying customer. Final pricing, proposals, sales follow-up, and closing remain the client's responsibility.";

export type CommercialArrangementFields = {
  arrangement_type: ArrangementType;
  arrangement_standard_fee: number;
  arrangement_upfront_payment: number;
  arrangement_payment_trigger: string | null;
  arrangement_attribution_period: string | null;
  arrangement_service: string | null;
  arrangement_client_services: string | null;
  arrangement_campaign_status: ArrangementCampaignStatus | null;
  arrangement_conversion_status: ArrangementConversionStatus | null;
  arrangement_fee_status: ArrangementFeeStatus | null;
  arrangement_special_terms: string | null;
  // Custom – Split Payment / Performance Milestones only (arrangement_type
  // === "custom_split_payment"). arrangement_upfront_payment above doubles
  // as this arrangement's "upfront deposit," and arrangement_standard_fee
  // above doubles as its "renewal/ongoing monthly rate" once the initial
  // engagement described by these fields is complete - both null/0 for
  // every other arrangement type, same as before this addition.
  arrangement_total_value: number | null;
  arrangement_milestone_1_amount: number | null;
  arrangement_milestone_1_condition: string | null;
  arrangement_milestone_2_amount: number | null;
  arrangement_milestone_2_condition: string | null;
  // "YYYY-MM-DD" or null - the agreed date the campaign is set to launch,
  // shown/edited alongside Campaign Status for any non-Standard-Monthly
  // arrangement (e.g. Teknokraft Canada Inc.: October 1, 2026, status
  // Pre-Launch / Onboarding). Never set automatically.
  arrangement_campaign_start_date: string | null;
};

// crm_opportunities-only extension - conversion is a business-record
// concept recorded later by "Mark as Converted", not something a
// consultation guide (which describes the arrangement agreed *during* the
// call) ever sets directly.
export type OpportunityCommercialArrangement = CommercialArrangementFields & {
  arrangement_conversion_date: string | null;
  arrangement_converted_business: string | null;
  arrangement_marked_converted_by: string | null;
  arrangement_marked_converted_at: string | null;
};

// The compact banner text for a Performance-Based Trial business record -
// "Performance-Based Trial — $0 Upfront | $750 Due on First Conversion |
// 60-Day Attribution". Money is always formatted as a whole dollar amount
// (every value here is a plain fee, never fractional cents) - `Number` on
// a numeric(12,2) column value that Postgres/postgrest may return as a
// string is intentional.
export function formatArrangementBanner(
  fields: Pick<
    CommercialArrangementFields,
    | "arrangement_type"
    | "arrangement_standard_fee"
    | "arrangement_upfront_payment"
    | "arrangement_attribution_period"
    | "arrangement_total_value"
    | "arrangement_milestone_1_amount"
    | "arrangement_milestone_2_amount"
  >
): string | null {
  if (fields.arrangement_type === "standard_monthly") return null;
  if (fields.arrangement_type === "custom_split_payment") {
    const deposit = `$${Number(fields.arrangement_upfront_payment)} Deposit`;
    const milestones =
      fields.arrangement_milestone_1_amount != null && fields.arrangement_milestone_2_amount != null
        ? `$${Number(fields.arrangement_milestone_1_amount)} + $${Number(fields.arrangement_milestone_2_amount)} Milestones`
        : null;
    const total = fields.arrangement_total_value != null ? `$${Number(fields.arrangement_total_value)} Total` : null;
    const parts = [deposit, milestones, total].filter((part): part is string => part !== null);
    return `${ARRANGEMENT_TYPE_LABELS.custom_split_payment} — ${parts.join(" | ")}`;
  }
  const upfront = `$${Number(fields.arrangement_upfront_payment)} Upfront`;
  const due = `$${Number(fields.arrangement_standard_fee)} Due on First Conversion`;
  const attribution = formatAttributionClause(fields.arrangement_attribution_period);
  return `${ARRANGEMENT_TYPE_LABELS[fields.arrangement_type]} — ${upfront} | ${due}${attribution}`;
}

// "60 days" (the default free-text value) renders as "60-Day Attribution",
// matching the brief's exact banner wording - any other free-text value
// (this field is never a restricted enum) falls back to appending
// "Attribution" after it verbatim rather than guessing a number out of it.
function formatAttributionClause(period: string | null): string {
  if (!period) return "";
  const trimmed = period.trim();
  if (!trimmed) return "";
  const daysMatch = trimmed.match(/^(\d+)\s*days?$/i);
  if (daysMatch) return ` | ${daysMatch[1]}-Day Attribution`;
  return ` | ${trimmed} Attribution`;
}
