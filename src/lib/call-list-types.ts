import type { CallListTargetField } from "./call-list-column-mapping";

export type CallListCrm = "growth" | "lead_generation";

export type CallListGoogleConnectionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  crm: CallListCrm;
  connected_by: string;
  google_email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  scope: string;
  status: "active" | "revoked" | "error";
  last_error: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type CallListSyncError = { row: number; message: string };

export type CallListSyncSummary = {
  newLeads: number;
  updated: number;
  duplicatesSkipped: number;
  dncSkipped: number;
  archived: number;
  errors: CallListSyncError[];
};

export type CallListSegmentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  crm: CallListCrm;
  name: string;
  google_connection_id: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  sheet_tab_name: string;
  sheet_tab_gid: number;
  column_mapping: Partial<Record<CallListTargetField, string>>;
  growth_opportunity_type: "lead_generation" | "business_financing" | "both_services" | null;
  leadgen_campaign_id: string | null;
  status: "active" | "paused" | "error" | "disconnected";
  last_synced_at: string | null;
  last_sync_status: "success" | "partial" | "error" | null;
  last_sync_summary: CallListSyncSummary | null;
  created_by: string;
};

export type CallListSyncRunRow = {
  id: string;
  segment_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "partial" | "error";
  triggered_by: string | null;
  new_leads_count: number;
  updated_count: number;
  duplicates_skipped_count: number;
  dnc_skipped_count: number;
  archived_count: number;
  error_count: number;
  errors: CallListSyncError[];
  error_message: string | null;
};

export type CallListSegmentAgentRow = {
  segment_id: string;
  agent_id: string;
  assigned_at: string;
};
