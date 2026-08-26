import type { CrmUserRow } from "./crm-types";

// Winsalot Growth CRM: Clients (crm_clients, migration 0091). A client is
// a signed, billed, actually-serviced account - entirely distinct from
// crm_opportunities (the sales pipeline of *prospective* consultations/
// financing). See that migration's header comment for the full design
// rationale (admin-only RLS, the agent-visible-clients RPC, etc).

export const CLIENT_STATUSES = ["Prospect", "Pilot", "Active", "Paused", "Completed", "Archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

// Every status a client can be archived *from* - the set pre_archive_status
// is restricted to, since a client is never archived from Archived itself.
export const PRE_ARCHIVE_STATUSES = ["Prospect", "Pilot", "Active", "Paused", "Completed"] as const;
export type PreArchiveStatus = (typeof PRE_ARCHIVE_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  Prospect: "Prospect",
  Pilot: "Pilot",
  Active: "Active",
  Paused: "Paused",
  Completed: "Completed",
  Archived: "Archived",
};

export const CLIENT_STATUS_STYLES: Record<ClientStatus, string> = {
  Prospect: "bg-indigo-100 text-indigo-800",
  Pilot: "bg-sky-100 text-sky-800",
  Active: "bg-emerald-100 text-emerald-800",
  Paused: "bg-amber-100 text-amber-800",
  Completed: "bg-slate-100 text-slate-700",
  Archived: "bg-rose-100 text-rose-700",
};

export const PAYMENT_METHODS = ["e_transfer", "credit_card", "bank_transfer", "cash", "cheque", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  e_transfer: "E-Transfer",
  credit_card: "Credit Card",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

// The only two currencies the Clients/Invoices feature supports today -
// CAD listed first and used as the default for every new client, since
// Winsalot Corp's clients are Canadian by default; USD is kept (not
// removed) for when American clients are added later. Enforced with a
// matching CHECK constraint on crm_clients/crm_invoices/crm_payments
// (migration 0095) so a currency can never reach the database through
// any path other than one of these two.
export const CLIENT_CURRENCIES = ["CAD", "USD"] as const;
export type ClientCurrency = (typeof CLIENT_CURRENCIES)[number];

export const CLIENT_CURRENCY_LABELS: Record<ClientCurrency, string> = {
  CAD: "CAD — Canadian Dollar",
  USD: "USD — US Dollar",
};

export const DEFAULT_CLIENT_CURRENCY: ClientCurrency = "CAD";

export function isClientCurrency(value: string): value is ClientCurrency {
  return (CLIENT_CURRENCIES as readonly string[]).includes(value);
}

export type CrmClientRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  company_name: string;
  primary_contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  billing_address: string | null;

  service: string | null;
  monthly_price: number | null;
  currency: string;

  start_date: string | null;
  renewal_date: string | null;

  status: ClientStatus;
  pre_archive_status: PreArchiveStatus | null;

  internal_notes: string | null;

  archived_at: string | null;
  archived_by: string | null;
};

export type CrmClientAgentRow = {
  client_id: string;
  agent_id: string;
  assigned_at: string;
  assigned_by: string | null;
};

export type CrmClientAgentWithUser = CrmClientAgentRow & {
  crm_users: Pick<CrmUserRow, "id" | "full_name" | "email"> | null;
};

export type CrmClientAppointmentRow = {
  id: string;
  created_at: string;
  client_id: string;
  agent_id: string | null;
  appointment_date: string;
  notes: string | null;
  created_by: string | null;
};

export type CrmClientAppointmentWithAgent = CrmClientAppointmentRow & {
  crm_users: Pick<CrmUserRow, "full_name" | "email"> | null;
};

export type CrmPaymentRow = {
  id: string;
  created_at: string;
  updated_at: string;
  invoice_id: string | null;
  client_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_by_name: string;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
};

// Row-shape returned by crm_agent_visible_clients() - the only way an
// agent may ever see client data. Deliberately excludes every financial
// column (monthly_price, currency, billing_address, etc) - see that
// function's own definition in migration 0091.
export type AgentVisibleClientRow = {
  id: string;
  company_name: string;
  primary_contact_name: string | null;
  service: string | null;
  status: ClientStatus;
  start_date: string | null;
};

export type NewCrmClientInput = {
  company_name: string;
  primary_contact_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  billing_address?: string;
  service?: string;
  monthly_price?: number;
  currency?: string;
  start_date?: string;
  renewal_date?: string;
  status?: ClientStatus;
  internal_notes?: string;
};

// Counts of every record type that must be zero before a client can be
// permanently deleted (brief: "permanently delete only when zero related
// appointments/invoices/payments/agent-activity/performance records
// exist"). Since a client has no direct link into the agent performance
// tables (those are per-agent, not per-client), "agent-activity" and
// "performance records" are interpreted here as this client's own
// assigned-agent relationships and its activity-timeline entries - any
// of which, like every other count here, means real history exists and
// archiving must be used instead of a permanent delete.
export type ClientRelatedCounts = {
  appointments: number;
  invoices: number;
  payments: number;
  assignedAgents: number;
  activities: number;
};

export function clientHasRelatedRecords(counts: ClientRelatedCounts): boolean {
  return counts.appointments > 0 || counts.invoices > 0 || counts.payments > 0 || counts.assignedAgents > 0 || counts.activities > 0;
}

export function describeClientRelatedRecords(counts: ClientRelatedCounts): string {
  const parts: string[] = [];
  if (counts.appointments > 0) parts.push(`${counts.appointments} appointment${counts.appointments === 1 ? "" : "s"}`);
  if (counts.invoices > 0) parts.push(`${counts.invoices} invoice${counts.invoices === 1 ? "" : "s"}`);
  if (counts.payments > 0) parts.push(`${counts.payments} payment${counts.payments === 1 ? "" : "s"}`);
  if (counts.assignedAgents > 0) parts.push(`${counts.assignedAgents} assigned agent${counts.assignedAgents === 1 ? "" : "s"}`);
  if (counts.activities > 0) parts.push(`${counts.activities} activity record${counts.activities === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function formatCurrency(amount: number | null | undefined, currency: string | null | undefined): string {
  const value = amount ?? 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(value);
  } catch {
    return `${currency || "USD"} ${value.toFixed(2)}`;
  }
}
