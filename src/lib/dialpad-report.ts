export type DialpadWorkspace = "growth" | "lead";

export type DialpadCallRow = {
  externalCallId: string | null;
  agentName: string;
  agentEmail: string | null;
  direction: string;
  status: string;
  startedAt: string | null;
  durationSeconds: number;
  phoneNumber: string | null;
  raw: Record<string, string>;
};

export type DialpadUserSummary = {
  agentName: string;
  agentEmail: string | null;
  totalCalls: number;
  placedCalls: number;
  answeredCalls: number;
  missedCalls: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
};

export type ParsedDialpadReport = {
  summaries: DialpadUserSummary[];
  calls: DialpadCallRow[];
};

export type DialpadIdentity = {
  agentName: string;
  agentEmail: string | null;
  agentRole?: "admin" | "agent";
};

const DIALPAD_IDENTITIES: Record<string, { agentName: string; agentRole: "admin" | "agent" }> = {
  "agent@winsalotcorp.com": { agentName: "Henry Osuji", agentRole: "agent" },
  "agent2@winsalotcorp.com": { agentName: "Goodness Ugbana", agentRole: "agent" },
  "info@winsalotcorp.com": { agentName: "C.J Amadi", agentRole: "admin" },
};

export function resolveDialpadIdentity(agentName: string, agentEmail: string | null): DialpadIdentity {
  const normalizedEmail = agentEmail?.trim().toLowerCase() || null;
  const mapped = normalizedEmail ? DIALPAD_IDENTITIES[normalizedEmail] : undefined;
  return {
    agentName: mapped?.agentName ?? agentName,
    agentEmail: normalizedEmail,
    agentRole: mapped?.agentRole,
  };
}

const HEADER_ALIASES = {
  agentName: ["user", "name", "agent", "agent name", "user name", "caller name"],
  agentEmail: ["email", "user email", "agent email"],
  rowType: ["type"],
  totalCalls: ["calls", "total calls", "call count", "all calls"],
  placedCalls: ["placed", "placed calls", "outbound", "outbound calls"],
  // "handled" (answered + outbound connected) is the true total of
  // successfully connected calls; "answered" alone only counts inbound
  // calls the agent answered, so it must come after "handled" here.
  answeredCalls: ["handled", "answered", "answered calls", "connected", "connected calls"],
  missedCalls: ["missed", "missed calls", "unanswered", "unanswered calls"],
  totalDuration: ["total duration", "duration total"],
  averageDuration: ["avg duration", "average duration", "average call duration"],
  // Dialpad's own stats exports report these two in fractional minutes
  // (e.g. talk_duration 40.52 for a 40.5-minute call block), not seconds.
  totalTalkMinutes: ["talk duration"],
  averageTalkMinutes: ["avg talk duration"],
  direction: ["direction", "call direction", "call type", "type"],
  status: ["status", "call status", "result", "disposition"],
  duration: ["duration", "call duration"],
  startedAt: ["start time", "started at", "date", "datetime", "call time", "timestamp"],
  phoneNumber: ["phone number", "external number", "called number", "contact", "target"],
  externalCallId: ["call id", "id", "call_id"],
} as const;

// Dialpad's Group Statistics export mixes individual agent rows with
// ring-group/call-center/IVR aggregate rows under the same "type" column;
// only agent rows should ever become CRM agent stats.
const NON_AGENT_ROW_TYPES = /group|queue|call ?center|department|ivr|office|room|coaching|team/;

function isAgentRow(row: Record<string, string>) {
  const rowType = valueFor(row, HEADER_ALIASES.rowType).toLowerCase();
  if (!rowType) return true;
  return !NON_AGENT_ROW_TYPES.test(rowType);
}

// Some exports (e.g. Dialpad's per-day User Statistics) include placeholder
// rows for days with zero activity and no identified user at all; there is
// no agent to attribute those rows to, so they must be dropped rather than
// invented a name for.
function hasIdentity(row: Record<string, string>) {
  return valueFor(row, HEADER_ALIASES.agentName) !== "" || valueFor(row, HEADER_ALIASES.agentEmail) !== "";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function valueFor(row: Record<string, string>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && value.trim() !== "") return value.trim();
  }
  return "";
}

function numberValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function minutesToSeconds(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 60)) : 0;
}

function totalDurationSecondsFor(row: Record<string, string>) {
  const talkMinutes = valueFor(row, HEADER_ALIASES.totalTalkMinutes);
  if (talkMinutes !== "") return minutesToSeconds(talkMinutes);
  return parseDurationSeconds(valueFor(row, HEADER_ALIASES.totalDuration));
}

function averageDurationSecondsFor(row: Record<string, string>) {
  const avgTalkMinutes = valueFor(row, HEADER_ALIASES.averageTalkMinutes);
  if (avgTalkMinutes !== "") return minutesToSeconds(avgTalkMinutes);
  return parseDurationSeconds(valueFor(row, HEADER_ALIASES.averageDuration));
}

export function parseDurationSeconds(value: string) {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return 0;

  if (/^\d+(?:\.\d+)?$/.test(cleaned)) return Math.max(0, Math.round(Number(cleaned)));

  const colonParts = cleaned.split(":").map(Number);
  if (colonParts.length === 2 && colonParts.every(Number.isFinite)) {
    return Math.max(0, Math.round(colonParts[0] * 60 + colonParts[1]));
  }
  if (colonParts.length === 3 && colonParts.every(Number.isFinite)) {
    return Math.max(0, Math.round(colonParts[0] * 3600 + colonParts[1] * 60 + colonParts[2]));
  }

  const hours = Number(cleaned.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)?.[1] ?? 0);
  const minutes = Number(cleaned.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/)?.[1] ?? 0);
  const seconds = Number(cleaned.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/)?.[1] ?? 0);
  return Math.max(0, Math.round(hours * 3600 + minutes * 60 + seconds));
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function toRecords(csv: string) {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("The CSV does not contain any Dialpad report rows.");

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = cells[index]?.trim() ?? "";
    });
    return record;
  });
}

function normalizedAgentName(row: Record<string, string>, index: number) {
  const email = valueFor(row, HEADER_ALIASES.agentEmail);
  return valueFor(row, HEADER_ALIASES.agentName) || email || `Dialpad User ${index + 1}`;
}

function parseStartedAt(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isAnswered(status: string, durationSeconds: number) {
  const normalized = status.toLowerCase();
  if (/missed|no answer|unanswered|canceled|cancelled|failed|voicemail/.test(normalized)) return false;
  return /answer|connected|completed/.test(normalized) || durationSeconds > 0;
}

function isMissed(status: string) {
  return /missed|no answer|unanswered/.test(status.toLowerCase());
}

export function parseDialpadCsv(csv: string): ParsedDialpadReport {
  const records = toRecords(csv).filter(isAgentRow).filter(hasIdentity);
  const hasSummaryColumns = records.some((row) => valueFor(row, HEADER_ALIASES.totalCalls) !== "");

  if (hasSummaryColumns) {
    // Some exports have one row per agent for the whole report period;
    // others (e.g. Dialpad's per-day User Statistics) have one row per
    // agent per day. Group by identity and sum so either shape collapses
    // to exactly one summary per agent.
    type Accumulator = DialpadUserSummary & { rowCount: number; lastAverageDurationSeconds: number };
    const grouped = new Map<string, Accumulator>();
    records.forEach((row, index) => {
      const identity = resolveDialpadIdentity(
        normalizedAgentName(row, index),
        valueFor(row, HEADER_ALIASES.agentEmail) || null
      );
      const key = (identity.agentEmail || identity.agentName).trim().toLowerCase();
      const accumulator: Accumulator = grouped.get(key) ?? {
        agentName: identity.agentName,
        agentEmail: identity.agentEmail,
        totalCalls: 0,
        placedCalls: 0,
        answeredCalls: 0,
        missedCalls: 0,
        totalDurationSeconds: 0,
        averageDurationSeconds: 0,
        rowCount: 0,
        lastAverageDurationSeconds: 0,
      };
      const totalCalls = numberValue(valueFor(row, HEADER_ALIASES.totalCalls));
      const totalDurationSeconds = totalDurationSecondsFor(row);
      accumulator.totalCalls += totalCalls;
      accumulator.placedCalls += numberValue(valueFor(row, HEADER_ALIASES.placedCalls));
      accumulator.answeredCalls += numberValue(valueFor(row, HEADER_ALIASES.answeredCalls));
      accumulator.missedCalls += numberValue(valueFor(row, HEADER_ALIASES.missedCalls));
      accumulator.totalDurationSeconds += totalDurationSeconds;
      accumulator.rowCount += 1;
      accumulator.lastAverageDurationSeconds =
        averageDurationSecondsFor(row) || (totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0);
      grouped.set(key, accumulator);
    });

    const summaries = [...grouped.values()].map((summary) => ({
      agentName: summary.agentName,
      agentEmail: summary.agentEmail,
      totalCalls: summary.totalCalls,
      placedCalls: summary.placedCalls,
      answeredCalls: summary.answeredCalls,
      missedCalls: summary.missedCalls,
      totalDurationSeconds: summary.totalDurationSeconds,
      // A single contributing row's own average is preserved as-is; once
      // multiple rows are merged, per-row averages can't be averaged
      // together, so it's recomputed from the summed totals instead.
      averageDurationSeconds:
        summary.rowCount === 1
          ? summary.lastAverageDurationSeconds
          : summary.totalCalls > 0
            ? Math.round(summary.totalDurationSeconds / summary.totalCalls)
            : 0,
    }));
    return { summaries: summaries.filter((summary) => summary.totalCalls > 0 || summary.agentName), calls: [] };
  }

  const calls: DialpadCallRow[] = records.map((row, index) => {
    const identity = resolveDialpadIdentity(
      normalizedAgentName(row, index),
      valueFor(row, HEADER_ALIASES.agentEmail) || null
    );
    const durationSeconds = parseDurationSeconds(valueFor(row, HEADER_ALIASES.duration));
    return {
      externalCallId: valueFor(row, HEADER_ALIASES.externalCallId) || null,
      agentName: identity.agentName,
      agentEmail: identity.agentEmail,
      direction: valueFor(row, HEADER_ALIASES.direction) || "Unknown",
      status: valueFor(row, HEADER_ALIASES.status) || "Unknown",
      startedAt: parseStartedAt(valueFor(row, HEADER_ALIASES.startedAt)),
      durationSeconds,
      phoneNumber: valueFor(row, HEADER_ALIASES.phoneNumber) || null,
      raw: row,
    };
  });

  const grouped = new Map<string, DialpadUserSummary>();
  calls.forEach((call) => {
    const key = (call.agentEmail || call.agentName).trim().toLowerCase();
    const summary = grouped.get(key) ?? {
      agentName: call.agentName,
      agentEmail: call.agentEmail,
      totalCalls: 0,
      placedCalls: 0,
      answeredCalls: 0,
      missedCalls: 0,
      totalDurationSeconds: 0,
      averageDurationSeconds: 0,
    };
    summary.totalCalls += 1;
    summary.placedCalls += /outbound|placed/.test(call.direction.toLowerCase()) ? 1 : 0;
    summary.answeredCalls += isAnswered(call.status, call.durationSeconds) ? 1 : 0;
    summary.missedCalls += isMissed(call.status) ? 1 : 0;
    summary.totalDurationSeconds += call.durationSeconds;
    grouped.set(key, summary);
  });

  const summaries = [...grouped.values()].map((summary) => ({
    ...summary,
    averageDurationSeconds: summary.totalCalls > 0 ? Math.round(summary.totalDurationSeconds / summary.totalCalls) : 0,
  }));
  return { summaries, calls };
}

export function formatDialpadDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}
