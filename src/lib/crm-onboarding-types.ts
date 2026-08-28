export const ONBOARDING_STATUSES = [
  "invited",
  "in_progress",
  "submitted",
  "approved",
  "changes_requested",
] as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export type CrmAgentOnboardingRow = {
  agent_id: string;
  status: OnboardingStatus;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  timezone: string;
  policies_acknowledged_at: string | null;
  attendance_acknowledged_at: string | null;
  confidentiality_acknowledged_at: string | null;
  quiz_score: number | null;
  quiz_passed_at: string | null;
  acknowledgement_name: string | null;
  acknowledgement_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentOnboardingAdminRow = CrmAgentOnboardingRow & {
  completed_required: number;
  total_required: number;
};

