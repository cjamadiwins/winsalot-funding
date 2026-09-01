import type { EmailEventStatus, OpportunityType } from "./crm-types";

export const MARKETING_CAMPAIGN_TYPES = ["lead_generation", "business_financing", "both_services"] as const;
export type MarketingCampaignType = (typeof MARKETING_CAMPAIGN_TYPES)[number];

export const MARKETING_CAMPAIGN_LABELS: Record<MarketingCampaignType, string> = {
  lead_generation: "Lead Generation",
  business_financing: "Business Financing",
  both_services: "Both Services",
};

export const MARKETING_ENROLLMENT_STATUSES = ["active", "paused", "stopped", "unsubscribed"] as const;
export type MarketingEnrollmentStatus = (typeof MARKETING_ENROLLMENT_STATUSES)[number];

export const MARKETING_ENROLLMENT_STATUS_LABELS: Record<MarketingEnrollmentStatus, string> = {
  active: "Active",
  paused: "Paused",
  stopped: "Stopped",
  unsubscribed: "Unsubscribed",
};

export type MarketingConsentBasis = "express" | "implied";

export type CrmMarketingTemplateRow = {
  id: string;
  created_at: string;
  updated_at: string;
  campaign_type: MarketingCampaignType;
  sequence_number: number;
  subject: string;
  body: string;
  cta_label: string;
  active: boolean;
};

export type CrmMarketingEnrollmentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  opportunity_id: string;
  campaign_type: MarketingCampaignType;
  status: MarketingEnrollmentStatus;
  consent_basis: MarketingConsentBasis;
  consent_notes: string;
  consent_recorded_at: string;
  consent_recorded_by: string | null;
  cadence_days: number;
  next_send_at: string;
  last_sent_at: string | null;
  send_count: number;
  last_error: string | null;
  claimed_at: string | null;
  claim_token: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  created_by: string | null;
};

export type CrmMarketingDeliveryRow = {
  id: string;
  created_at: string;
  enrollment_id: string;
  opportunity_id: string | null;
  template_id: string | null;
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

export type MarketingOpportunitySummary = {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  stage: string;
  opportunity_type: OpportunityType;
};

export function isMarketingCampaignType(value: string): value is MarketingCampaignType {
  return MARKETING_CAMPAIGN_TYPES.includes(value as MarketingCampaignType);
}

