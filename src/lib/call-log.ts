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
