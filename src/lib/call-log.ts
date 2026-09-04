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

export type CallLogRow = {
  id: string;
  created_at: string;
  agent_id: string;
  business_name: string;
  phone: string;
  outcome: CallLogOutcome;
  notes: string;
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
