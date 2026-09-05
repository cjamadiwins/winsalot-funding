export const CALL_LOG_OUTCOMES = [
  "No Answer",
  "Voicemail",
  "Gatekeeper",
  "Not Interested",
  "Callback",
] as const;

export type CallLogOutcome = (typeof CALL_LOG_OUTCOMES)[number];

export const CALL_LOG_AUTOMATIC_NOTES: Record<CallLogOutcome, string> = {
  "No Answer": "No answer",
  Voicemail: "Voicemail left",
  Gatekeeper: "Spoke with gatekeeper",
  "Not Interested": "Not interested",
  Callback: "Callback requested",
};

export const CALL_LOG_OUTCOME_STYLES: Record<CallLogOutcome, string> = {
  "No Answer": "bg-amber-100 text-amber-800",
  Voicemail: "bg-amber-100 text-amber-800",
  Gatekeeper: "bg-sky-100 text-sky-800",
  "Not Interested": "bg-rose-100 text-rose-800",
  Callback: "bg-orange-100 text-orange-800",
};

export const GROWTH_CRM_BUSINESS_CLIENT_NAME = "Winsalot Corp." as const;

export type CallLogRow = {
  id: string;
  created_at: string;
  agent_id: string;
  business_name: string;
  phone: string;
  outcome: CallLogOutcome;
  notes: string;
  // Lead Gen CRM only (leadgen_call_logs.client_visible_note, migration
  // 0142) - a separate, optional note an admin can write for the client
  // to see on their own Client Portal Call Activity page. Never the same
  // as `notes` above (internal/agent-facing, never shown to a client
  // login) and never populated for the Growth CRM's crm_call_logs, which
  // has no such column and no client login to show it to.
  client_visible_note?: string | null;
  // The client the agent is calling on behalf of - a required, permanent
  // link chosen from each CRM's existing client records (never free text).
  // Always "Winsalot Corp." in the Growth CRM (agents prospect on
  // Winsalot's own behalf); the selected leadgen_clients.name in the Lead
  // Generation CRM. Distinct from `business_name` above, which is the
  // free-text name of the actual prospect/business being called.
  businessClient: string;
};

export function isCallLogOutcome(value: string): value is CallLogOutcome {
  return CALL_LOG_OUTCOMES.includes(value as CallLogOutcome);
}

export function formatCallLogDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
