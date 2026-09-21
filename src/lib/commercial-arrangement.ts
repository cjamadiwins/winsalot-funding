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

export const ARRANGEMENT_TYPES = ["standard_monthly", "performance_based_trial", "custom_arrangement"] as const;
export type ArrangementType = (typeof ARRANGEMENT_TYPES)[number];

export const ARRANGEMENT_TYPE_LABELS: Record<ArrangementType, string> = {
  standard_monthly: "Standard Monthly",
  performance_based_trial: "Performance-Based Trial",
  custom_arrangement: "Custom Arrangement",
};

export const ARRANGEMENT_CAMPAIGN_STATUSES = ["pending_agreement", "ready_to_start", "active", "converted", "completed", "cancelled"] as const;
export type ArrangementCampaignStatus = (typeof ARRANGEMENT_CAMPAIGN_STATUSES)[number];

export const ARRANGEMENT_CAMPAIGN_STATUS_LABELS: Record<ArrangementCampaignStatus, string> = {
  pending_agreement: "Pending Agreement",
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
export function formatArrangementBanner(fields: Pick<CommercialArrangementFields, "arrangement_type" | "arrangement_standard_fee" | "arrangement_upfront_payment" | "arrangement_attribution_period">): string | null {
  if (fields.arrangement_type === "standard_monthly") return null;
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
