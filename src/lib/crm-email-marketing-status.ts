import { MARKETING_ELIGIBLE_STAGES, type MarketingEnrollmentStatus } from "./crm-marketing-types";

// A business/prospect's Email Marketing status as shown on its own Growth
// CRM record - derived entirely from the existing crm_marketing_enrollments
// row and crm_email_suppressions check (never a stored column of its own),
// so this can never drift from what the weekly marketing job and the
// suppression list actually enforce.
export const EMAIL_MARKETING_STATUSES = ["enrolled", "not_enrolled", "consent_required", "unsubscribed"] as const;
export type EmailMarketingStatus = (typeof EMAIL_MARKETING_STATUSES)[number];

export const EMAIL_MARKETING_STATUS_LABELS: Record<EmailMarketingStatus, string> = {
  enrolled: "Enrolled",
  not_enrolled: "Not Enrolled",
  consent_required: "Consent Required",
  unsubscribed: "Unsubscribed",
};

export const EMAIL_MARKETING_STATUS_STYLES: Record<EmailMarketingStatus, string> = {
  enrolled: "bg-emerald-100 text-emerald-800",
  not_enrolled: "bg-slate-100 text-slate-600",
  consent_required: "bg-amber-100 text-amber-800",
  unsubscribed: "bg-red-100 text-red-700",
};

// Same "add an email, get it contacted first" eligibility
// enrollMarketingContactAction re-validates server-side - reused here so
// this status can only ever say "Consent Required" for a business the
// enroll action would actually accept.
export function isEligibleForEmailMarketing(input: { stage: string; email: string | null }): boolean {
  return MARKETING_ELIGIBLE_STAGES.has(input.stage) && !!input.email?.trim();
}

// `enrollmentStatus` is null when no crm_marketing_enrollments row exists
// yet for this opportunity at all (never enrolled).
export function deriveEmailMarketingStatus(input: {
  stage: string;
  email: string | null;
  isSuppressed: boolean;
  enrollmentStatus: MarketingEnrollmentStatus | null;
}): EmailMarketingStatus {
  if (input.isSuppressed || input.enrollmentStatus === "unsubscribed") return "unsubscribed";
  if (input.enrollmentStatus === "active" || input.enrollmentStatus === "paused") return "enrolled";
  return isEligibleForEmailMarketing(input) ? "consent_required" : "not_enrolled";
}
