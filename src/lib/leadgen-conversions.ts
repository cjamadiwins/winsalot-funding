import type { KpiTone } from "@/components/crm-ui/KpiCard";
import { isPerformanceBasedFirst, isStagedPerformanceBasedFirst, type CrmClientAgreementRow } from "@/lib/crm-agreement-types";

// Lead Generation CRM: Conversion Tracking - types, labels, and the
// generic (never client-name-hardcoded) performance-payment-trigger
// planning algorithm. Deliberately has NO "server-only" import and no
// Supabase client code - it's imported directly by client components
// (e.g. ConversionsListClient.tsx) for its labels/styles/constants. The
// actual DB-writing trigger (triggerPerformancePaymentIfEligible) lives in
// the separate, "server-only" lib/leadgen-conversion-payment-trigger.ts
// instead - see that file. See
// supabase/migrations/20260928020000_leadgen_conversion_tracking.sql for
// the leadgen_conversions/leadgen_conversion_payment_triggers schema this
// mirrors, and that migration's header comment for the two-track
// conversion_status vs admin_verification_status design.

// ---------------------------------------------------------------------
// Admin-authoritative conversion pipeline (the seven brief-mandated
// stages). Never advanced past 'appointment_attended' merely because an
// appointment happened - only Admin (or the migration's own conservative
// backfill) ever sets a 'converted_*'/'not_converted' value.
// ---------------------------------------------------------------------
export const LEADGEN_CONVERSION_STATUSES = [
  "appointment_booked",
  "appointment_attended",
  "proposal_sent",
  "follow_up_open",
  "converted_payment_pending",
  "converted_paid",
  "not_converted",
] as const;
export type LeadgenConversionStatus = (typeof LEADGEN_CONVERSION_STATUSES)[number];

export const LEADGEN_CONVERSION_STATUS_LABELS: Record<LeadgenConversionStatus, string> = {
  appointment_booked: "Appointment Booked",
  appointment_attended: "Appointment Attended",
  proposal_sent: "Proposal / Quote Sent",
  follow_up_open: "Follow-Up Still Open",
  converted_payment_pending: "Converted – Payment Pending",
  converted_paid: "Converted – Paid",
  not_converted: "Not Converted",
};

export const LEADGEN_CONVERSION_STATUS_STYLES: Record<LeadgenConversionStatus, string> = {
  appointment_booked: "bg-sky-100 text-sky-800",
  appointment_attended: "bg-indigo-100 text-indigo-800",
  proposal_sent: "bg-amber-100 text-amber-800",
  follow_up_open: "bg-orange-100 text-orange-800",
  converted_payment_pending: "bg-purple-100 text-purple-800",
  converted_paid: "bg-emerald-100 text-emerald-800",
  not_converted: "bg-slate-200 text-slate-600",
};

// Statuses that count as "the deal is closed, one way or another" for
// funnel/rate calculations below.
export const LEADGEN_CONVERSION_TERMINAL_STATUSES: readonly LeadgenConversionStatus[] = ["converted_paid", "not_converted"];

// ---------------------------------------------------------------------
// Client-report review queue - what a client most recently self-reported
// and whether Admin has acted on it. A client submission can only ever
// move this to 'pending_admin_verification' (enforced server-side in the
// report-conversion action, not just by RLS) - it can never itself move
// conversion_status to converted_paid/converted_payment_pending.
// ---------------------------------------------------------------------
export const LEADGEN_ADMIN_VERIFICATION_STATUSES = ["not_submitted", "pending_admin_verification", "confirmed", "rejected"] as const;
export type LeadgenAdminVerificationStatus = (typeof LEADGEN_ADMIN_VERIFICATION_STATUSES)[number];

export const LEADGEN_ADMIN_VERIFICATION_STATUS_LABELS: Record<LeadgenAdminVerificationStatus, string> = {
  not_submitted: "Not Submitted",
  pending_admin_verification: "Pending Admin Verification",
  confirmed: "Confirmed",
  rejected: "Rejected / Needs Clarification",
};

export const LEADGEN_ADMIN_VERIFICATION_STATUS_STYLES: Record<LeadgenAdminVerificationStatus, string> = {
  not_submitted: "bg-slate-100 text-slate-500",
  pending_admin_verification: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

// The five Report Conversion form options (brief's exact wording).
export const LEADGEN_CLIENT_REPORTED_RESULTS = ["paying_customer", "payment_pending", "proposal_sent", "follow_up_ongoing", "not_converted"] as const;
export type LeadgenClientReportedResult = (typeof LEADGEN_CLIENT_REPORTED_RESULTS)[number];

export const LEADGEN_CLIENT_REPORTED_RESULT_LABELS: Record<LeadgenClientReportedResult, string> = {
  paying_customer: "Prospect Became a Paying Customer",
  payment_pending: "Prospect Agreed to Purchase – Payment Pending",
  proposal_sent: "Proposal / Quote Sent",
  follow_up_ongoing: "Follow-Up Still Ongoing",
  not_converted: "Prospect Did Not Convert",
};

// The exact required checkbox wording (brief) - the report-conversion
// action refuses to save a paying-customer report without it checked.
export const LEADGEN_CLIENT_CONVERSION_CONFIRMATION_TEXT =
  "I confirm that this prospect was generated or introduced through Winsalot Corp and has become a paying customer of our business.";

export type LeadgenConversionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  lead_id: string | null;
  appointment_id: string;
  client_id: string;
  campaign_id: string | null;
  agent_id: string | null;
  conversion_status: LeadgenConversionStatus;
  conversion_status_set_by: string | null;
  conversion_status_set_at: string | null;
  admin_verification_status: LeadgenAdminVerificationStatus;
  client_reported_result: LeadgenClientReportedResult | null;
  client_reported_at: string | null;
  client_reported_by: string | null;
  client_reported_conversion_date: string | null;
  client_reported_sale_amount: number | null;
  client_reported_notes: string | null;
  client_confirmation_checked: boolean;
  admin_conversion_date: string | null;
  admin_sale_amount: number | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  duplicate_override_by: string | null;
  duplicate_override_at: string | null;
  updated_by: string | null;
};

export type LeadgenConversionPaymentTriggerRow = {
  id: string;
  created_at: string;
  conversion_id: string;
  client_id: string;
  campaign_id: string | null;
  crm_client_id: string | null;
  crm_agreement_id: string | null;
  conversion_number: number;
  payment_stage_label: string;
  amount_triggered: number;
  currency: string;
  confirmed_by: string;
  confirmed_at: string;
};

// Dashboard KPI-card tones (brief: "Use the existing Winsalot card and
// styling system") - same KpiTone palette every other Lead Gen CRM
// dashboard card already draws from.
export const LEADGEN_CONVERSION_DASHBOARD_TONE: Record<
  "conversionsThisMonth" | "pendingVerification" | "convertedPaid" | "convertedPending" | "notConverted" | "paymentsTriggered",
  KpiTone
> = {
  conversionsThisMonth: "blue",
  pendingVerification: "amber",
  convertedPaid: "green",
  convertedPending: "indigo",
  notConverted: "red",
  paymentsTriggered: "indigo",
};

// Maps what a client reported to the conversion_status Admin would most
// likely confirm - shown to Admin purely as a suggestion/default on the
// review screen. Never applied automatically: only an explicit Admin
// action ever writes conversion_status (see confirmClientReportAction).
export function suggestedConversionStatusForClientReport(result: LeadgenClientReportedResult): LeadgenConversionStatus {
  switch (result) {
    case "paying_customer":
      return "converted_paid";
    case "payment_pending":
      return "converted_payment_pending";
    case "proposal_sent":
      return "proposal_sent";
    case "follow_up_ongoing":
      return "follow_up_open";
    case "not_converted":
      return "not_converted";
  }
}

// Client Campaign View funnel (brief: "Appointments Booked -> Appointments
// Attended -> Proposals/Quotes -> Converted Customers") plus a conversion
// rate based on actual confirmed paying customers, never merely
// appointments. A conversion only ever counts toward a later funnel stage
// once it has reached (or passed through) that stage - so "Proposals/Quotes"
// counts every conversion whose status is proposal_sent OR any later stage
// (follow_up_open/converted_*), not just the ones currently sitting at
// proposal_sent.
export type LeadgenConversionFunnel = {
  appointmentsBooked: number;
  appointmentsAttended: number;
  proposalsSent: number;
  convertedCustomers: number;
  conversionRatePercent: number | null;
};

const FUNNEL_ATTENDED_OR_LATER: readonly LeadgenConversionStatus[] = [
  "appointment_attended",
  "proposal_sent",
  "follow_up_open",
  "converted_payment_pending",
  "converted_paid",
  "not_converted",
];
const FUNNEL_PROPOSAL_OR_LATER: readonly LeadgenConversionStatus[] = ["proposal_sent", "follow_up_open", "converted_payment_pending", "converted_paid"];

export function buildLeadgenConversionFunnel(conversions: Pick<LeadgenConversionRow, "conversion_status">[]): LeadgenConversionFunnel {
  const total = conversions.length;
  const appointmentsAttended = conversions.filter((c) => FUNNEL_ATTENDED_OR_LATER.includes(c.conversion_status)).length;
  const proposalsSent = conversions.filter((c) => FUNNEL_PROPOSAL_OR_LATER.includes(c.conversion_status)).length;
  const convertedCustomers = conversions.filter((c) => c.conversion_status === "converted_paid").length;
  return {
    appointmentsBooked: total,
    appointmentsAttended,
    proposalsSent,
    convertedCustomers,
    conversionRatePercent: total > 0 ? Math.round((convertedCustomers / total) * 1000) / 10 : null,
  };
}

// ---------------------------------------------------------------------
// Duplicate-conversion protection (brief: "Prevent the same prospect from
// being counted as multiple conversions for the same campaign unless
// there is a legitimate separate transaction and Admin explicitly
// approves it"). Purely advisory/read-only - flags whether another
// converted_paid conversion already exists for the same business name in
// the same campaign, so the confirm-conversion UI can require an explicit
// duplicate_override before letting a second one through. Matches on
// business name (via the linked lead/appointment) rather than lead_id,
// since a legitimate repeat customer may come through a brand new
// lead/appointment record entirely.
// ---------------------------------------------------------------------
export function findPotentialDuplicateConversions(
  candidate: Pick<LeadgenConversionRow, "id" | "campaign_id">,
  candidateBusinessName: string,
  allConversions: (Pick<LeadgenConversionRow, "id" | "campaign_id" | "conversion_status" | "duplicate_override_by"> & { businessName: string })[]
): typeof allConversions {
  const normalized = candidateBusinessName.trim().toLowerCase();
  if (!normalized) return [];
  return allConversions.filter(
    (c) =>
      c.id !== candidate.id &&
      c.campaign_id === candidate.campaign_id &&
      c.conversion_status === "converted_paid" &&
      c.businessName.trim().toLowerCase() === normalized
  );
}

// ---------------------------------------------------------------------
// Generic (never client-name-hardcoded) performance-payment-trigger
// algorithm. Reads only campaign_type/staged_deposit_amount/
// conversion_status/staged_second_conversion_status/monthly_fee/currency
// off a Growth CRM crm_client_agreements row - the exact same fields
// buildPerformanceBasedFirstPaymentSummary() (crm-agreement-types.ts)
// already uses to *display* the payment breakdown on the Client
// Onboarding dashboard. This is that same shape, but for deciding what
// should actually be triggered next:
//   - A non-performance-based agreement (or none at all) -> null. No
//     trigger of any kind, ever, regardless of conversion activity.
//   - A single-lump-sum PBF agreement (Web6 Solutions' shape -
//     staged_deposit_amount is null): only ONE stage exists at all - the
//     full monthly_fee, guarded by conversion_status still being
//     'not_converted'. Once triggered, conversion_status flips to
//     'converted' and this agreement can never trigger again.
//   - A staged PBF agreement (Teknokraft/Hidebrandt's shape -
//     staged_deposit_amount is set): TWO stages exist, each
//     (monthly_fee - staged_deposit_amount) / 2, guarded independently -
//     the first only while conversion_status is still 'not_converted',
//     the second only once conversion_status is already 'converted' AND
//     staged_second_conversion_status is still 'not_converted' - so the
//     two stages can never fire out of order or more than once each.
// This function only ever *describes* what should happen next - it never
// mutates anything. triggerPerformancePaymentIfEligible() below is the
// only place that actually flips the guarded column, via an atomic
// conditional UPDATE (not read-then-write) so a duplicate/concurrent
// confirmation can never fire the same stage twice.
// ---------------------------------------------------------------------
export type PerformancePaymentStagePlan = {
  guards: { column: "conversion_status" | "staged_second_conversion_status"; equals: "not_converted" | "converted" }[];
  setColumn: "conversion_status" | "staged_second_conversion_status";
  setDateColumn: "converted_at" | "staged_second_converted_at";
  conversionNumber: 1 | 2;
  stageLabel: string;
  amount: number;
  currency: "CAD" | "USD";
};

export function resolveNextPerformancePaymentStage(
  agreement: Pick<
    CrmClientAgreementRow,
    "campaign_type" | "staged_deposit_amount" | "conversion_status" | "staged_second_conversion_status" | "monthly_fee" | "currency"
  >
): PerformancePaymentStagePlan | null {
  if (!isPerformanceBasedFirst(agreement)) return null;

  if (!isStagedPerformanceBasedFirst(agreement)) {
    if (agreement.conversion_status === "converted") return null;
    return {
      guards: [{ column: "conversion_status", equals: "not_converted" }],
      setColumn: "conversion_status",
      setDateColumn: "converted_at",
      conversionNumber: 1,
      stageLabel: "First Conversion Payment (Full Campaign Fee)",
      amount: Number(agreement.monthly_fee),
      currency: agreement.currency,
    };
  }

  const deposit = Number(agreement.staged_deposit_amount);
  const perConversion = (Number(agreement.monthly_fee) - deposit) / 2;

  if (agreement.conversion_status !== "converted") {
    return {
      guards: [{ column: "conversion_status", equals: "not_converted" }],
      setColumn: "conversion_status",
      setDateColumn: "converted_at",
      conversionNumber: 1,
      stageLabel: "First Conversion Payment",
      amount: perConversion,
      currency: agreement.currency,
    };
  }
  if (agreement.staged_second_conversion_status !== "converted") {
    return {
      guards: [
        { column: "conversion_status", equals: "converted" },
        { column: "staged_second_conversion_status", equals: "not_converted" },
      ],
      setColumn: "staged_second_conversion_status",
      setDateColumn: "staged_second_converted_at",
      conversionNumber: 2,
      stageLabel: "Second Conversion Payment",
      amount: perConversion,
      currency: agreement.currency,
    };
  }
  // Both stages already triggered for this shape - "Each converted
  // customer can trigger only one conversion stage" - no third stage
  // exists.
  return null;
}
