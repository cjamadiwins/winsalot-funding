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

// Split date/time, used by the Call Log detail modal (which shows "exact
// time" as its own field) and the CSV export (separate Date/Time columns,
// as requested) - formatCallLogDate above stays as the combined form
// already used by every existing compact table row.
export function formatCallLogDateOnly(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatCallLogTimeOnly(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

export const CALL_LOG_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type CallLogPageSize = (typeof CALL_LOG_PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_CALL_LOG_PAGE_SIZE: CallLogPageSize = 25;

export function isCallLogPageSize(value: number): value is CallLogPageSize {
  return (CALL_LOG_PAGE_SIZE_OPTIONS as readonly number[]).includes(value);
}

const CALL_LOG_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Every filter/sort/pagination input the admin Call Logs list (and its CSV
// export, which reuses the same filters) accepts, parsed once from raw
// searchParams-style string values with safe defaults - shared by both the
// Growth CRM and Lead Generation CRM admin pages so the URL shape, defaults,
// and validation never drift between them.
export type CallLogListParams = {
  search: string;
  agent: string;
  client: string;
  outcome: string;
  from: string;
  to: string;
  page: number;
  pageSize: CallLogPageSize;
};

export function parseCallLogListParams(sp: Record<string, string | undefined>): CallLogListParams {
  const pageSizeRaw = Number(sp.pageSize);
  const pageSize = isCallLogPageSize(pageSizeRaw) ? pageSizeRaw : DEFAULT_CALL_LOG_PAGE_SIZE;
  const pageRaw = Number(sp.page);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const from = sp.from && CALL_LOG_DATE_KEY.test(sp.from) ? sp.from : "";
  const to = sp.to && CALL_LOG_DATE_KEY.test(sp.to) ? sp.to : "";

  return {
    search: (sp.q ?? "").trim(),
    agent: sp.agent && sp.agent.trim() ? sp.agent : "all",
    client: sp.client && sp.client.trim() ? sp.client : "all",
    outcome: sp.outcome && sp.outcome.trim() ? sp.outcome : "all",
    from,
    to,
    page,
    pageSize,
  };
}

// PostgREST's `.or()` filter string treats "," and "(" / ")" as grammar, not
// literal search text - escape them so a search term containing one can
// never break the filter (or be misread as a second condition) instead of
// erroring or silently searching something else. "%"/"_" are left alone -
// those are ILIKE's own wildcards and a user typing one expects wildcard
// behavior, same as any other search box backed by ILIKE.
export function callLogSearchOrFilter(search: string): string {
  const escaped = search.replace(/[,()]/g, (ch) => `\\${ch}`);
  return `business_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`;
}

export function callLogDateRangeBounds(from: string, to: string): { gte?: string; lte?: string } {
  const bounds: { gte?: string; lte?: string } = {};
  if (from) bounds.gte = `${from}T00:00:00.000Z`;
  if (to) bounds.lte = `${to}T23:59:59.999Z`;
  return bounds;
}

export function callLogRangeFor(page: number, pageSize: number): [number, number] {
  const start = (page - 1) * pageSize;
  return [start, start + pageSize - 1];
}

export type CallLogCsvRow = {
  createdAt: string;
  agentName: string;
  businessName: string;
  businessClient: string;
  phone: string;
  outcome: CallLogOutcome;
  notes: string;
  clientVisibleNote?: string | null;
};

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

// Same escaping/BOM/CRLF convention as leadgenClientReportCsv
// (src/lib/leadgen-client-report.ts) - the BOM is what makes Excel open the
// file as UTF-8 instead of guessing the wrong codepage on names with
// accented characters.
export function buildCallLogsCsv(rows: CallLogCsvRow[], options?: { includeClientVisibleNote?: boolean }): string {
  const includeNote = options?.includeClientVisibleNote ?? false;
  const header = ["Date", "Time", "Agent", "Business", "Client/Business", "Phone", "Result", "Notes"];
  if (includeNote) header.push("Client-Visible Note");

  const lines = [
    header,
    ...rows.map((row) => {
      const line = [
        formatCallLogDateOnly(row.createdAt),
        formatCallLogTimeOnly(row.createdAt),
        row.agentName,
        row.businessName,
        row.businessClient,
        row.phone,
        row.outcome,
        row.notes,
      ];
      if (includeNote) line.push(row.clientVisibleNote ?? "");
      return line;
    }),
  ];

  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
}

export function callLogExportFilename(date: Date = new Date()): string {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return `Winsalot_Call_Logs_${key}.csv`;
}
