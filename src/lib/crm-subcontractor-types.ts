// Growth CRM Subcontractor Management: types and pure logic for the full
// onboarding/agreement/training/permissions/payroll lifecycle (migrations
// 0136/0137). Growth-CRM-only - nothing here is used by, or affects, the
// Lead Generation CRM's existing (and unmodified) leadgen_subcontractors
// feature. Currency/pay-type constants and calculations are imported from
// the existing src/lib/subcontractor-payroll.ts (shared, pure, and
// already generic across both CRMs - reused here rather than duplicated).

import type { SubcontractorCurrency, SubcontractorPayType } from "./subcontractor-payroll";

export const SUBCONTRACTOR_STATUSES = ["pending_onboarding", "active", "inactive", "suspended", "terminated"] as const;
export type SubcontractorStatus = (typeof SUBCONTRACTOR_STATUSES)[number];

export const SUBCONTRACTOR_STATUS_LABELS: Record<SubcontractorStatus, string> = {
  pending_onboarding: "Pending Onboarding",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  terminated: "Terminated",
};

export const SUBCONTRACTOR_STATUS_BADGE_CLASSES: Record<SubcontractorStatus, string> = {
  pending_onboarding: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-200 text-slate-600",
  suspended: "bg-rose-100 text-rose-800",
  terminated: "bg-slate-300 text-slate-700",
};

// Full crm_subcontractors row (migration 0135, extended by 0136, extended
// again by 20260922120000 with partner_type + referral-partner fields).
export type SubcontractorProfileRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  country: string | null;
  currency: SubcontractorCurrency;
  pay_type: SubcontractorPayType;
  pay_rate: number;
  notes: string | null;
  start_date: string | null;
  status: SubcontractorStatus;
  active: boolean;
  deactivated_at: string | null;
  deactivated_by: string | null;
  partner_type: SubcontractorPartnerType;
  primary_markets: string[] | null;
  lead_gen_revenue_share_percent: number | null;
  lending_commission_share_percent: number | null;
  partner_overview_email_subject: string | null;
  partner_overview_email_body: string | null;
  partner_overview_email_status: PartnerOverviewEmailStatus;
  partner_overview_email_sent_at: string | null;
  partner_overview_email_error: string | null;
};

// ---------------------------------------------------------------------
// Referral Partners (migration 20260922120000) - a second kind of row in
// the same crm_subcontractors table, for an introducer paid a recurring
// revenue/commission share (e.g. Tony) rather than the full Contractor
// onboarding/agreement/training/payroll lifecycle above. See that
// migration's header comment for the full design rationale.
// ---------------------------------------------------------------------

export const SUBCONTRACTOR_PARTNER_TYPES = ["contractor", "referral_partner"] as const;
export type SubcontractorPartnerType = (typeof SUBCONTRACTOR_PARTNER_TYPES)[number];

export const SUBCONTRACTOR_PARTNER_TYPE_LABELS: Record<SubcontractorPartnerType, string> = {
  contractor: "Contractor",
  referral_partner: "Subcontractor / Referral Partner",
};

// Fixed checkbox list a referral partner's Primary Markets are chosen
// from - covers Tony's own profile plus the Ideal Lead Generation Clients
// categories from the Partner Overview email, so the same list works for
// future referral partners without a schema change (primary_markets is a
// plain text[], not an enum column).
export const REFERRAL_PARTNER_MARKET_OPTIONS = [
  "Website Design",
  "Website Development",
  "SEO",
  "Digital Marketing",
  "IT & Professional B2B Services",
  "Business Lending Referrals",
] as const;

export function isReferralPartner(subcontractor: Pick<SubcontractorProfileRow, "partner_type">): boolean {
  return subcontractor.partner_type === "referral_partner";
}

export const PARTNER_OVERVIEW_EMAIL_STATUSES = ["not_sent", "sending", "sent", "failed"] as const;
export type PartnerOverviewEmailStatus = (typeof PARTNER_OVERVIEW_EMAIL_STATUSES)[number];

export const PARTNER_OVERVIEW_EMAIL_STATUS_LABELS: Record<PartnerOverviewEmailStatus, string> = {
  not_sent: "Not Sent",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
};

export const PARTNER_OVERVIEW_EMAIL_STATUS_BADGE_CLASSES: Record<PartnerOverviewEmailStatus, string> = {
  not_sent: "bg-slate-100 text-slate-700",
  sending: "bg-sky-100 text-sky-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

// Lead Generation recurring revenue-share tracking (crm_subcontractor_referral_revenue).
export type SubcontractorReferralPaymentStatus = "unpaid" | "partial" | "paid";
export type SubcontractorReferralCommissionStatus = "not_due" | "due" | "paid";

export const REFERRAL_PAYMENT_STATUS_LABELS: Record<SubcontractorReferralPaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially Collected",
  paid: "Collected",
};

export const REFERRAL_COMMISSION_STATUS_LABELS: Record<SubcontractorReferralCommissionStatus, string> = {
  not_due: "Not Due",
  due: "Due",
  paid: "Paid",
};

export type SubcontractorReferralRevenueRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  subcontractor_id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  monthly_amount: number;
  amount_collected: number;
  revenue_share_percent_snapshot: number;
  currency_snapshot: SubcontractorCurrency;
  partner_share: number;
  winsalot_share: number;
  payment_status: SubcontractorReferralPaymentStatus;
  payment_date: string | null;
  commission_status: SubcontractorReferralCommissionStatus;
  commission_paid_at: string | null;
  notes: string | null;
};

// Business Lending Commission Share tracking (crm_subcontractor_lending_referrals).
export type SubcontractorLendingReferralStatus = "pending_funding" | "funded_awaiting_commission" | "commission_received" | "paid_to_partner";

export const LENDING_REFERRAL_STATUS_LABELS: Record<SubcontractorLendingReferralStatus, string> = {
  pending_funding: "Pending Funding",
  funded_awaiting_commission: "Funded - Awaiting Commission",
  commission_received: "Commission Received",
  paid_to_partner: "Paid to Partner",
};

export const LENDING_REFERRAL_STATUS_BADGE_CLASSES: Record<SubcontractorLendingReferralStatus, string> = {
  pending_funding: "bg-slate-100 text-slate-700",
  funded_awaiting_commission: "bg-amber-100 text-amber-800",
  commission_received: "bg-sky-100 text-sky-800",
  paid_to_partner: "bg-emerald-100 text-emerald-800",
};

export type SubcontractorLendingReferralRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  subcontractor_id: string;
  opportunity_id: string | null;
  business_name: string;
  funded_at: string | null;
  commission_share_percent_snapshot: number;
  currency_snapshot: SubcontractorCurrency;
  lender_commission_received: number;
  clawback_adjustment: number;
  commission_received_at: string | null;
  partner_share: number;
  winsalot_share: number;
  commission_status: SubcontractorLendingReferralStatus;
  commission_paid_at: string | null;
  notes: string | null;
};

// A referral partner's total financial picture, derived from their
// revenue-share and lending-referral rows - never stored, always computed
// from the underlying ledger rows so it can never drift out of sync with
// them (same philosophy as onboardingProgressSummary above).
export type ReferralPartnerFinancialSummary = {
  monthlyRecurringRevenue: number;
  totalRevenueGenerated: number;
  partnerShareTotal: number;
  winsalotShareTotal: number;
};

// Monthly Recurring Revenue Generated: for each client, the monthly_amount
// of their most recent revenue-share period (by period_start) - not a sum
// across every historical period, which would double-count past months.
export function summarizeReferralPartnerFinancials(
  revenueRows: Pick<SubcontractorReferralRevenueRow, "client_id" | "period_start" | "monthly_amount" | "amount_collected" | "partner_share" | "winsalot_share">[],
  lendingRows: Pick<SubcontractorLendingReferralRow, "lender_commission_received" | "clawback_adjustment" | "partner_share" | "winsalot_share">[]
): ReferralPartnerFinancialSummary {
  const latestByClient = new Map<string, (typeof revenueRows)[number]>();
  for (const row of revenueRows) {
    const current = latestByClient.get(row.client_id);
    if (!current || row.period_start > current.period_start) latestByClient.set(row.client_id, row);
  }

  const monthlyRecurringRevenue = Array.from(latestByClient.values()).reduce((sum, row) => sum + row.monthly_amount, 0);

  const leadGenCollected = revenueRows.reduce((sum, row) => sum + row.amount_collected, 0);
  const leadGenPartnerShare = revenueRows.reduce((sum, row) => sum + row.partner_share, 0);
  const leadGenWinsalotShare = revenueRows.reduce((sum, row) => sum + row.winsalot_share, 0);

  const lendingNetCollected = lendingRows.reduce((sum, row) => sum + Math.max(row.lender_commission_received - row.clawback_adjustment, 0), 0);
  const lendingPartnerShare = lendingRows.reduce((sum, row) => sum + row.partner_share, 0);
  const lendingWinsalotShare = lendingRows.reduce((sum, row) => sum + row.winsalot_share, 0);

  return {
    monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue * 100) / 100,
    totalRevenueGenerated: Math.round((leadGenCollected + lendingNetCollected) * 100) / 100,
    partnerShareTotal: Math.round((leadGenPartnerShare + lendingPartnerShare) * 100) / 100,
    winsalotShareTotal: Math.round((leadGenWinsalotShare + lendingWinsalotShare) * 100) / 100,
  };
}

export type SubcontractorClientAssignmentRow = {
  id: string;
  created_at: string;
  subcontractor_id: string;
  client_id: string;
  assigned_at: string;
  assigned_by: string | null;
  unassigned_at: string | null;
  notes: string | null;
};

export type SubcontractorClientOption = { id: string; company_name: string };

export type SubcontractorAgreementTemplateRow = {
  id: string;
  created_at: string;
  version: number;
  is_current: boolean;
  content: { key: string; title: string; body: string }[];
};

export type SubcontractorAgreementRow = {
  id: string;
  subcontractor_id: string;
  template_id: string;
  version: number;
  rendered_content: { key: string; title: string; body: string }[];
  contractor_name_typed: string;
  business_name_snapshot: string | null;
  address_snapshot: string | null;
  country_snapshot: string | null;
  email_snapshot: string | null;
  currency_snapshot: string | null;
  pay_type_snapshot: string | null;
  rate_snapshot: number | null;
  start_date_snapshot: string | null;
  assigned_client_snapshot: string | null;
  accepted_at: string;
  ip_address: string | null;
  user_id: string | null;
};

export type SubcontractorTrainingModuleRow = {
  id: string;
  created_at: string;
  updated_at: string;
  slug: string;
  title: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  content: string;
};

export type SubcontractorTrainingStatus = "not_started" | "in_progress" | "completed";

export const SUBCONTRACTOR_TRAINING_STATUS_LABELS: Record<SubcontractorTrainingStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
};

export type SubcontractorTrainingProgressRow = {
  id: string;
  created_at: string;
  updated_at: string;
  subcontractor_id: string;
  module_id: string;
  status: SubcontractorTrainingStatus;
  required_override: boolean | null;
  started_at: string | null;
  completed_at: string | null;
};

export const SUBCONTRACTOR_CRM_ACCESS_OPTIONS = ["no_access", "growth_crm"] as const;
export type SubcontractorCrmAccess = (typeof SUBCONTRACTOR_CRM_ACCESS_OPTIONS)[number];

export const SUBCONTRACTOR_CRM_ACCESS_LABELS: Record<SubcontractorCrmAccess, string> = {
  no_access: "No Access",
  growth_crm: "Growth CRM",
};

export type SubcontractorPermissionsRow = {
  subcontractor_id: string;
  updated_at: string;
  updated_by: string | null;
  crm_access: SubcontractorCrmAccess;
  view_assigned_leads: boolean;
  add_call_logs: boolean;
  update_lead_status: boolean;
  book_appointments: boolean;
  view_assigned_training: boolean;
};

export type SubcontractorAuditAction =
  | "created"
  | "profile_updated"
  | "agreement_accepted"
  | "client_assignment_changed"
  | "compensation_changed"
  | "crm_access_granted"
  | "crm_access_revoked"
  | "permissions_changed"
  | "training_completed"
  | "payroll_approved"
  | "payroll_paid"
  | "status_changed"
  | "deactivated"
  | "reactivated"
  | "referral_prospect_linked"
  | "referral_prospect_unlinked"
  | "referral_client_linked"
  | "referral_client_unlinked"
  | "referral_revenue_recorded"
  | "referral_revenue_commission_paid"
  | "lending_referral_recorded"
  | "lending_referral_commission_paid"
  | "partner_overview_email_sent";

export const SUBCONTRACTOR_AUDIT_ACTION_LABELS: Record<SubcontractorAuditAction, string> = {
  created: "Subcontractor created",
  profile_updated: "Profile updated",
  agreement_accepted: "Agreement accepted",
  client_assignment_changed: "Client assignment changed",
  compensation_changed: "Compensation changed",
  crm_access_granted: "CRM access granted",
  crm_access_revoked: "CRM access revoked",
  permissions_changed: "Permissions changed",
  training_completed: "Training completed",
  payroll_approved: "Payroll approved",
  payroll_paid: "Payroll marked paid",
  status_changed: "Status changed",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  referral_prospect_linked: "Prospect linked",
  referral_prospect_unlinked: "Prospect unlinked",
  referral_client_linked: "Client linked",
  referral_client_unlinked: "Client unlinked",
  referral_revenue_recorded: "Revenue recorded",
  referral_revenue_commission_paid: "Revenue share commission paid",
  lending_referral_recorded: "Lending referral recorded",
  lending_referral_commission_paid: "Lending commission paid",
  partner_overview_email_sent: "Partner Overview Email sent",
};

export type SubcontractorAuditLogRow = {
  id: string;
  created_at: string;
  subcontractor_id: string;
  action: SubcontractorAuditAction;
  performed_by: string | null;
  performed_by_name: string;
  reason: string | null;
  details: Record<string, unknown> | null;
};

// Extended crm_subcontractor_payments row (migration 0135, snapshots
// added by 0136) - the 4-state payment status model.
export type SubcontractorPaymentStatus = "draft" | "pending_approval" | "approved" | "paid";

export const SUBCONTRACTOR_PAYMENT_STATUS_LABELS: Record<SubcontractorPaymentStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  paid: "Paid",
};

export const SUBCONTRACTOR_PAYMENT_STATUS_BADGE_CLASSES: Record<SubcontractorPaymentStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
};

export type SubcontractorPaymentRecordRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  subcontractor_id: string;
  period_start: string;
  period_end: string;
  quantity: number | null;
  gross_pay: number;
  adjustments: number;
  deductions: number;
  net_pay: number;
  status: SubcontractorPaymentStatus;
  payment_date: string | null;
  notes: string | null;
  rate_snapshot: number;
  currency_snapshot: SubcontractorCurrency;
  pay_type_snapshot: SubcontractorPayType | null;
  business_client_snapshot: string | null;
};

// ---------------------------------------------------------------------
// Onboarding checklist - derived, never stored, same philosophy as
// deriveCrmOnboardingStage()/deriveCrmPilotStage() in crm-agreement-types.ts:
// walking a fixed pipeline of independently-checkable facts rather than
// persisting a redundant status that could drift out of sync with the
// records that actually define it.
// ---------------------------------------------------------------------

export type SubcontractorOnboardingItemKey =
  | "personal_info"
  | "agreement_accepted"
  | "payment_setup"
  | "client_assigned"
  | "training_completed"
  | "crm_access_granted"
  | "active";

export type SubcontractorOnboardingItem = {
  key: SubcontractorOnboardingItemKey;
  label: string;
  complete: boolean;
};

export const SUBCONTRACTOR_ONBOARDING_ITEM_LABELS: Record<SubcontractorOnboardingItemKey, string> = {
  personal_info: "Personal Information Completed",
  agreement_accepted: "Independent Contractor Agreement Accepted",
  payment_setup: "Payment Setup Completed",
  client_assigned: "Client/Business Assigned",
  training_completed: "Required Training Completed",
  crm_access_granted: "CRM Access Granted",
  active: "Onboarding Complete / Active",
};

export function deriveSubcontractorOnboardingChecklist(input: {
  subcontractor: Pick<SubcontractorProfileRow, "email" | "phone" | "country" | "currency" | "pay_type" | "status">;
  hasCurrentAgreement: boolean;
  hasCurrentAssignment: boolean;
  requiredModulesComplete: boolean;
  crmAccessGranted: boolean;
}): SubcontractorOnboardingItem[] {
  const { subcontractor, hasCurrentAgreement, hasCurrentAssignment, requiredModulesComplete, crmAccessGranted } = input;

  const personalInfoComplete = Boolean(subcontractor.email && subcontractor.phone && subcontractor.country);
  const paymentSetupComplete = Boolean(subcontractor.currency && subcontractor.pay_type);
  const active = subcontractor.status === "active";

  return [
    { key: "personal_info", label: SUBCONTRACTOR_ONBOARDING_ITEM_LABELS.personal_info, complete: personalInfoComplete },
    { key: "agreement_accepted", label: SUBCONTRACTOR_ONBOARDING_ITEM_LABELS.agreement_accepted, complete: hasCurrentAgreement },
    { key: "payment_setup", label: SUBCONTRACTOR_ONBOARDING_ITEM_LABELS.payment_setup, complete: paymentSetupComplete },
    { key: "client_assigned", label: SUBCONTRACTOR_ONBOARDING_ITEM_LABELS.client_assigned, complete: hasCurrentAssignment },
    { key: "training_completed", label: SUBCONTRACTOR_ONBOARDING_ITEM_LABELS.training_completed, complete: requiredModulesComplete },
    { key: "crm_access_granted", label: SUBCONTRACTOR_ONBOARDING_ITEM_LABELS.crm_access_granted, complete: crmAccessGranted },
    { key: "active", label: SUBCONTRACTOR_ONBOARDING_ITEM_LABELS.active, complete: active },
  ];
}

export function onboardingProgressSummary(items: SubcontractorOnboardingItem[]): string {
  const completed = items.filter((item) => item.complete).length;
  return `${completed} of ${items.length} completed`;
}

// Sums subcontractor payments' net_pay grouped by each payment's own
// currency_snapshot - never the subcontractor's *current* currency, so a
// later currency change never shifts a historical total (brief section K:
// "historical records should not change when the subcontractor's future
// rate changes"). Never summed across currencies (no FX conversion).
export function sumSubcontractorPaymentRecordsByCurrency(
  payments: Pick<SubcontractorPaymentRecordRow, "currency_snapshot" | "net_pay">[]
): Partial<Record<SubcontractorCurrency, number>> {
  const totals: Partial<Record<SubcontractorCurrency, number>> = {};
  for (const payment of payments) {
    const currency = payment.currency_snapshot;
    totals[currency] = Math.round(((totals[currency] ?? 0) + payment.net_pay) * 100) / 100;
  }
  return totals;
}

// A subcontractor may only become 'active' once every checklist item
// (other than 'active' itself) is complete, or an admin explicitly
// overrides it (brief section B: "...or manually overridden by admin").
export function canActivateSubcontractor(items: SubcontractorOnboardingItem[]): boolean {
  return items.filter((item) => item.key !== "active").every((item) => item.complete);
}

// Whether a subcontractor's required training modules are all completed -
// "required" is the module's own is_required default unless a
// per-subcontractor required_override says otherwise.
export function requiredTrainingComplete(
  modules: Pick<SubcontractorTrainingModuleRow, "id" | "is_required" | "is_active">[],
  progressByModuleId: Map<string, Pick<SubcontractorTrainingProgressRow, "status" | "required_override">>
): boolean {
  return modules
    .filter((module) => module.is_active)
    .filter((module) => {
      const progress = progressByModuleId.get(module.id);
      return progress?.required_override ?? module.is_required;
    })
    .every((module) => progressByModuleId.get(module.id)?.status === "completed");
}
