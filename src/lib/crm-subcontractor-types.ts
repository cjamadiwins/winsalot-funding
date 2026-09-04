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

// Full crm_subcontractors row (migration 0135, extended by 0136).
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
};

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
  | "reactivated";

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
