import type { CallListTargetField } from "./call-list-column-mapping";

export type CallListCrm = "growth" | "lead_generation";

export type CallListSegmentStatus = "draft" | "active" | "completed" | "archived";

export type CallListSegmentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  crm: CallListCrm;
  name: string;
  campaign_name: string | null;
  industry: string | null;
  territory: string | null;
  source_file_name: string | null;
  source_file_type: "csv" | "xlsx" | null;
  total_uploaded_rows: number;
  growth_opportunity_type: "lead_generation" | "business_financing" | "both_services" | null;
  leadgen_campaign_id: string | null;
  status: CallListSegmentStatus;
  deployed_at: string | null;
  deployed_by: string | null;
  created_by: string;
};

export type CallListLeadRow = {
  id: string;
  created_at: string;
  updated_at: string;
  segment_id: string;
  source_row_number: number | null;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  province: string | null;
  industry: string | null;
  notes: string | null;
  extra_fields: Record<string, string>;
  is_possible_duplicate: boolean;
  duplicate_reason: string | null;
  dnc_flag: boolean;
  last_outcome: string | null;
  last_contacted_at: string | null;
  callback_at: string | null;
  assigned_agent_id: string | null;
  promoted_opportunity_id: string | null;
  promoted_leadgen_lead_id: string | null;
  promoted_at: string | null;
  created_by: string | null;
};

export type CallListSegmentAgentRow = {
  segment_id: string;
  agent_id: string;
  assigned_at: string;
};

export const CALL_LIST_EDITABLE_FIELDS: CallListTargetField[] = [
  "business_name",
  "contact_name",
  "phone",
  "email",
  "website",
  "city",
  "province",
  "industry",
  "notes",
];
