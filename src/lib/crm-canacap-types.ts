export const CANACAP_STATUSES = [
  "not_started",
  "documents_pending",
  "ready_to_submit",
  "submitted",
  "approved",
  "declined",
] as const;
export type CanacapStatus = (typeof CANACAP_STATUSES)[number];

export const CANACAP_STATUS_LABELS: Record<CanacapStatus, string> = {
  not_started: "Not Started",
  documents_pending: "Documents Pending",
  ready_to_submit: "Ready to Submit",
  submitted: "Submitted",
  approved: "Approved",
  declined: "Declined",
};

export function isCanacapStatus(value: string): value is CanacapStatus {
  return (CANACAP_STATUSES as readonly string[]).includes(value);
}

export type CrmCanacapApplicationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_name: string;
  owner_name: string | null;
  status: CanacapStatus;
  date_submitted: string | null;
  has_bank_statements: boolean;
  has_completed_application: boolean;
  has_incorporation_date: boolean;
  has_owner_info: boolean;
  notes: string | null;
};

export const CANACAP_DOCUMENTS = [
  { field: "has_bank_statements", label: "Six months of business bank statements" },
  { field: "has_completed_application", label: "Completed financing application" },
  { field: "has_incorporation_date", label: "Business incorporation date" },
  { field: "has_owner_info", label: "Owner/director information" },
] as const;
