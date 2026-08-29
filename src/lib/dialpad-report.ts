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
  "agent1@winsalotcorp.com": { agentName: "Henry Osuji", agentRole: "agent" },
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
  totalCalls: ["calls", "total calls", "call count"],
  placedCalls: ["placed", "placed calls", "outbound", "outbound calls"],
  answeredCalls: ["answered", "answered calls", "connected", "connected calls"],
  missedCalls: ["missed", "missed calls", "unanswered", "unanswered calls"],
  totalDuration: ["total duration", "duration total"],
  averageDuration: ["avg duration", "average duration", "average call duration"],
  direction: ["direction", "call direction", "call type", "type"],
  status: ["status", "call status", "result", "disposition"],
  duration: ["duration", "call duration"],
  startedAt: ["start time", "started at", "date", "datetime", "call time", "timestamp"],
  phoneNumber: ["phone number", "external number", "called number", "contact", "target"],
  externalCallId: ["call id", "id", "call_id"],
} as const;

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
  const records = toRecords(csv);
  const hasSummaryColumns = records.some((row) => valueFor(row, HEADER_ALIASES.totalCalls) !== "");

  if (hasSummaryColumns) {
    const summaries = records.map((row, index) => {
      const identity = resolveDialpadIdentity(
        normalizedAgentName(row, index),
        valueFor(row, HEADER_ALIASES.agentEmail) || null
      );
      const totalCalls = numberValue(valueFor(row, HEADER_ALIASES.totalCalls));
      const totalDurationSeconds = parseDurationSeconds(valueFor(row, HEADER_ALIASES.totalDuration));
      const averageDurationSeconds =
        parseDurationSeconds(valueFor(row, HEADER_ALIASES.averageDuration)) ||
        (totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0);
      return {
        agentName: identity.agentName,
        agentEmail: identity.agentEmail,
        totalCalls,
        placedCalls: numberValue(valueFor(row, HEADER_ALIASES.placedCalls)),
        answeredCalls: numberValue(valueFor(row, HEADER_ALIASES.answeredCalls)),
        missedCalls: numberValue(valueFor(row, HEADER_ALIASES.missedCalls)),
        totalDurationSeconds,
        averageDurationSeconds,
      };
    });
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
