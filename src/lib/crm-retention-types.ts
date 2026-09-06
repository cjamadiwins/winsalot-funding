import type { EmailEventStatus } from "./crm-types";

export const RETENTION_CAMPAIGN_TYPES = ["client_success", "follow_up", "re_engagement"] as const;
export type RetentionCampaignType = (typeof RETENTION_CAMPAIGN_TYPES)[number];

export const RETENTION_CAMPAIGN_LABELS: Record<RetentionCampaignType, string> = {
  client_success: "Client Success",
  follow_up: "Follow-Up",
  re_engagement: "Re-Engagement",
};

// The retention module's own per-client status (brief section 5) -
// distinct from crm_clients.status (Prospect/Pilot/Active/Paused/
// Completed/Archived), never overloads or replaces it.
export const RETENTION_STATUSES = [
  "active",
  "paused",
  "follow_up",
  "re_engagement",
  "re_engagement_completed",
  "inactive",
  "cancelled",
] as const;
export type RetentionStatus = (typeof RETENTION_STATUSES)[number];

export const RETENTION_STATUS_LABELS: Record<RetentionStatus, string> = {
  active: "Active",
  paused: "Paused",
  follow_up: "Follow-Up",
  re_engagement: "Re-Engagement",
  re_engagement_completed: "Re-Engagement Completed",
  inactive: "Inactive",
  cancelled: "Cancelled",
};

export const RETENTION_STATUS_STYLES: Record<RetentionStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  follow_up: "bg-orange-100 text-orange-800",
  re_engagement: "bg-purple-100 text-purple-800",
  re_engagement_completed: "bg-slate-200 text-slate-700",
  inactive: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-100 text-rose-800",
};

export type CrmRetentionTemplateRow = {
  id: string;
  created_at: string;
  updated_at: string;
  campaign_type: RetentionCampaignType;
  sequence_number: number;
  label: string;
  subject: string;
  body: string;
  active: boolean;
};

export type CrmRetentionEnrollmentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  campaign_type: RetentionCampaignType;
  retention_status: RetentionStatus;
  auto_send: boolean;
  start_date: string;
  cadence_days: number;
  next_send_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  re_engagement_started_at: string | null;
  re_engagement_completed_at: string | null;
  last_error: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  removed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type CrmRetentionFollowupRow = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  enrollment_id: string;
  follow_up_date: string;
  follow_up_reason: string;
  internal_note: string | null;
  assigned_admin: string | null;
  last_contact_at: string | null;
  next_contact_at: string | null;
  auto_send: boolean;
  template_id: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  sent_at: string | null;
  resolved_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
};

export type CrmRetentionEmailRow = {
  id: string;
  created_at: string;
  enrollment_id: string;
  followup_id: string | null;
  client_id: string;
  template_id: string | null;
  campaign_type: RetentionCampaignType;
  occurrence_key: string;
  scheduled_for: string;
  to_email: string;
  subject: string;
  resend_email_id: string | null;
  status: "sending" | EmailEventStatus;
  status_at: string;
  attempt_count: number;
  sent_at: string | null;
  delivered_at: string | null;
  delayed_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  error_detail: string | null;
};

export const RETENTION_EVENT_TYPES = [
  "enrolled",
  "client_success_email_sent",
  "paused",
  "resumed",
  "stopped",
  "campaign_type_changed",
  "removed_from_campaign",
  "followup_scheduled",
  "followup_email_sent",
  "followup_resolved",
  "followup_cancelled",
  "re_engagement_started",
  "re_engagement_email_sent",
  "re_engagement_completed",
  "manual_review_required",
  "delivery_failed",
] as const;
export type RetentionEventType = (typeof RETENTION_EVENT_TYPES)[number];

export type CrmRetentionEventRow = {
  id: string;
  created_at: string;
  client_id: string;
  enrollment_id: string | null;
  event_type: RetentionEventType;
  notes: string;
  performed_by: string | null;
  performed_by_name: string | null;
  occurred_at: string;
};

export type RetentionClientSummary = {
  id: string;
  company_name: string;
  primary_contact_name: string | null;
  email: string | null;
  status: string;
};

export function isRetentionCampaignType(value: string): value is RetentionCampaignType {
  return RETENTION_CAMPAIGN_TYPES.includes(value as RetentionCampaignType);
}

export function isRetentionStatus(value: string): value is RetentionStatus {
  return RETENTION_STATUSES.includes(value as RetentionStatus);
}

// Fixed allowlist for "Send Test Email" on /admin/crm/retention - same
// pattern and rationale as MARKETING_TEST_EMAIL_RECIPIENTS
// (crm-marketing-types.ts): never extend this from admin-browser data.
export const RETENTION_TEST_EMAIL_RECIPIENTS = [
  { email: "info@winsalotcorp.com", label: "info@winsalotcorp.com (Outlook)" },
  { email: "winsalotcorp@gmail.com", label: "winsalotcorp@gmail.com (Gmail)" },
  { email: "cjamadiwins@gmail.com", label: "cjamadiwins@gmail.com (Gmail)" },
] as const;
export type RetentionTestEmailRecipient = (typeof RETENTION_TEST_EMAIL_RECIPIENTS)[number]["email"];

export function isRetentionTestEmailRecipient(value: string): value is RetentionTestEmailRecipient {
  return RETENTION_TEST_EMAIL_RECIPIENTS.some((recipient) => recipient.email === value);
}
