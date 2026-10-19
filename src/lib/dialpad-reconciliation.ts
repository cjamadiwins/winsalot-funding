// Read-only Dialpad <-> CRM call reconciliation. Pure functions only: no
// database access and nothing here can create or change a call record,
// outcome, lead or follow-up (see dialpad-reconciliation-data.ts for the
// read-only loader and the test that guards against writes).
//
// Source of truth for Dialpad is the daily rows inside the committed User
// Statistics CSV exports, NOT the weekly totals stored in
// dialpad_call_reports: those carry a period label that does not always
// match the file (two stored reports hold the Aug 21-28 export under other
// dates) and weekly totals cannot be split by day, so overlapping uploads
// could only be guessed between. Day-level rows can be keyed by
// (agent, date) and counted exactly once.
//
// Dialpad has no per-call data here, so reconciliation is by count per agent
// per day. It cannot say WHICH calls are missing - only how many.
import { resolveDialpadIdentity, type DialpadDailyRow } from "./dialpad-report";
import { addDays, leadgenDateKey, leadgenMondayOf } from "./leadgen-performance";

export type CrmSource = "lead" | "growth";

export type DialpadFileInput = {
  fileName: string;
  // Every date present in the file (including blank placeholder rows).
  dates: string[];
  rows: DialpadDailyRow[];
};

export type CrmCallInput = {
  source: CrmSource;
  agentKey: string;
  // Toronto calendar date, YYYY-MM-DD.
  date: string;
  // Lead CRM campaign id; null for Growth CRM (no campaigns) or unassigned.
  campaignId: string | null;
  count: number;
};

export type DialpadDay = {
  agentKey: string;
  agentName: string;
  agentRole: "admin" | "agent";
  date: string;
  outbound: number;
  total: number;
  inbound: number;
};

export type DialpadMergeResult = {
  days: Map<string, DialpadDay>; // key: `${agentKey}|${date}`
  coveredDates: Set<string>;
  files: { fileName: string; coverageStart: string; coverageEnd: string; agentDays: number }[];
  // Agent-days present in more than one file with identical numbers - counted once.
  duplicateAgentDays: number;
  // Agent-days present in more than one file with DIFFERENT numbers.
  conflicts: { agentName: string; date: string; kept: number; dropped: number; keptFile: string; droppedFile: string }[];
  // Dates covered by more than one file.
  overlappingDates: string[];
};

// Within max(3 calls, 5%) of Dialpad's outbound count counts as matched:
// agents log a call after it ends, so small timing/rounding differences are
// expected and should not be flagged as missing activity.
export function matchTolerance(dialpadOutbound: number) {
  return Math.max(3, Math.round(dialpadOutbound * 0.05));
}

export function agentKeyFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function datesBetween(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function mergeDialpadFiles(files: DialpadFileInput[]): DialpadMergeResult {
  const ordered = files
    .map((file) => ({ file, sorted: [...file.dates].sort() }))
    .filter((entry) => entry.sorted.length > 0)
    // Later exports win a genuine conflict: sort by coverage end, then name.
    .sort((a, b) => {
      const endA = a.sorted[a.sorted.length - 1];
      const endB = b.sorted[b.sorted.length - 1];
      return endA === endB ? a.file.fileName.localeCompare(b.file.fileName) : endA < endB ? -1 : 1;
    });

  const days = new Map<string, DialpadDay>();
  const dayFile = new Map<string, string>();
  const coveredDates = new Set<string>();
  const dateFileCount = new Map<string, number>();
  const result: DialpadMergeResult = {
    days,
    coveredDates,
    files: [],
    duplicateAgentDays: 0,
    conflicts: [],
    overlappingDates: [],
  };

  for (const { file, sorted } of ordered) {
    const coverageStart = sorted[0];
    const coverageEnd = sorted[sorted.length - 1];
    // A file covers every calendar day from its first to last row: Dialpad
    // omits weekend/idle days or emits blank placeholder rows for them, and
    // an agent with no row on a covered day genuinely had zero calls.
    for (const date of datesBetween(coverageStart, coverageEnd)) {
      coveredDates.add(date);
      dateFileCount.set(date, (dateFileCount.get(date) ?? 0) + 1);
    }

    // Within one file an agent/day should be unique; if Dialpad repeats it
    // (e.g. two seats mapped to one person) the counts are summed.
    const fileDays = new Map<string, DialpadDay>();
    for (const row of file.rows) {
      const identity = resolveDialpadIdentity(row.agentName, row.agentEmail);
      const agentName = identity.agentRole ? identity.agentName : row.agentEmail ?? row.agentName;
      const key = `${agentKeyFor(agentName)}|${row.date}`;
      const existing = fileDays.get(key);
      if (existing) {
        existing.outbound += row.outboundCalls;
        existing.total += row.totalCalls;
        existing.inbound += row.inboundCalls;
      } else {
        fileDays.set(key, {
          agentKey: agentKeyFor(agentName),
          agentName,
          agentRole: identity.agentRole ?? "agent",
          date: row.date,
          outbound: row.outboundCalls,
          total: row.totalCalls,
          inbound: row.inboundCalls,
        });
      }
    }

    result.files.push({ fileName: file.fileName, coverageStart, coverageEnd, agentDays: fileDays.size });
    for (const [key, day] of fileDays) {
      const prior = days.get(key);
      if (!prior) {
        days.set(key, day);
        dayFile.set(key, file.fileName);
      } else if (prior.outbound === day.outbound && prior.total === day.total && prior.inbound === day.inbound) {
        result.duplicateAgentDays += 1;
      } else {
        result.conflicts.push({
          agentName: day.agentName,
          date: day.date,
          kept: day.outbound,
          dropped: prior.outbound,
          keptFile: file.fileName,
          droppedFile: dayFile.get(key) ?? "",
        });
        days.set(key, day);
        dayFile.set(key, file.fileName);
      }
    }
  }

  result.overlappingDates = [...dateFileCount.entries()].filter(([, count]) => count > 1).map(([date]) => date).sort();
  return result;
}

export type ReconciliationStatus =
  | "matched"
  | "crm_lower" // Dialpad shows more outbound calls than the CRM has logged
  | "crm_higher" // CRM has more calls than Dialpad shows
  | "crm_only" // CRM activity on days no Dialpad export covers
  | "before_crm" // Dialpad activity from before the agent's first CRM call log
  | "campaign_filtered"; // Dialpad has no campaign data; only CRM counts shown

export const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  matched: "Matched",
  crm_lower: "Dialpad calls not found in CRM",
  crm_higher: "CRM higher than Dialpad",
  crm_only: "CRM only (no Dialpad data)",
  before_crm: "Dialpad only (CRM logging not started)",
  campaign_filtered: "CRM only (campaign filter)",
};

export type ReconciliationFilters = {
  agentKey: string; // "all" or an agent key
  campaign: string; // "all" | "growth" | "unassigned" | leadgen campaign id
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

export type RowFigures = {
  dialpadOutbound: number;
  dialpadTotal: number;
  // Dialpad outbound calls dated before the agent's first CRM call log. The
  // call-log feature was not in use yet, so these are not "missing" calls and
  // are kept out of the comparison.
  dialpadBeforeCrm: number;
  crmLead: number;
  crmGrowth: number;
  crmTotal: number;
  // CRM calls on days a Dialpad export covers - the figure compared to Dialpad.
  crmComparable: number;
  // CRM calls on days no Dialpad export covers - unmatched, never compared.
  crmOutsideCoverage: number;
  difference: number | null; // crmComparable - dialpadOutbound
  missingFromCrm: number; // max(0, -difference): Dialpad calls with no CRM record
  extraInCrm: number; // max(0, difference): CRM calls beyond Dialpad
  coveragePct: number | null; // crmComparable / dialpadOutbound
  coveredDays: number;
  status: ReconciliationStatus;
};

export type DailyRow = RowFigures & { date: string; agentKey: string; agentName: string };
export type WeeklyRow = RowFigures & { weekStart: string; weekEnd: string; agentKey: string; agentName: string };
export type AgentRow = RowFigures & { agentKey: string; agentName: string };

export type ReconciliationReport = {
  dialpadComparable: boolean;
  agents: AgentRow[];
  weekly: WeeklyRow[];
  daily: DailyRow[];
  totals: RowFigures;
  adminSeatCalls: number;
  quality: {
    files: DialpadMergeResult["files"];
    duplicateAgentDays: number;
    conflicts: DialpadMergeResult["conflicts"];
    overlappingDates: string[];
    uncoveredDatesWithCrmActivity: string[];
  };
};

type Accumulator = {
  dialpadOutbound: number;
  dialpadTotal: number;
  dialpadBeforeCrm: number;
  crmLead: number;
  crmGrowth: number;
  crmComparable: number;
  crmOutsideCoverage: number;
  coveredDays: number;
};

function slot(map: Map<string, Accumulator>, key: string) {
  let acc = map.get(key);
  if (!acc) map.set(key, (acc = emptyAccumulator()));
  return acc;
}

const emptyAccumulator = (): Accumulator => ({
  dialpadOutbound: 0,
  dialpadTotal: 0,
  dialpadBeforeCrm: 0,
  crmLead: 0,
  crmGrowth: 0,
  crmComparable: 0,
  crmOutsideCoverage: 0,
  coveredDays: 0,
});

function finalize(acc: Accumulator, dialpadComparable: boolean): RowFigures {
  const crmTotal = acc.crmLead + acc.crmGrowth;
  const hasCoverage = acc.coveredDays > 0;
  const difference = dialpadComparable && hasCoverage ? acc.crmComparable - acc.dialpadOutbound : null;
  let status: ReconciliationStatus;
  if (!dialpadComparable) status = "campaign_filtered";
  else if (!hasCoverage) status = acc.dialpadBeforeCrm > 0 && acc.crmLead + acc.crmGrowth === 0 ? "before_crm" : "crm_only";
  else {
    const tolerance = matchTolerance(acc.dialpadOutbound);
    const diff = acc.crmComparable - acc.dialpadOutbound;
    status = Math.abs(diff) <= tolerance ? "matched" : diff < 0 ? "crm_lower" : "crm_higher";
  }
  return {
    dialpadOutbound: dialpadComparable ? acc.dialpadOutbound : 0,
    dialpadTotal: dialpadComparable ? acc.dialpadTotal : 0,
    dialpadBeforeCrm: dialpadComparable ? acc.dialpadBeforeCrm : 0,
    crmLead: acc.crmLead,
    crmGrowth: acc.crmGrowth,
    crmTotal,
    crmComparable: acc.crmComparable,
    crmOutsideCoverage: acc.crmOutsideCoverage,
    difference,
    missingFromCrm: difference !== null && difference < 0 ? -difference : 0,
    extraInCrm: difference !== null && difference > 0 ? difference : 0,
    coveragePct: difference !== null && acc.dialpadOutbound > 0 ? Math.round((acc.crmComparable / acc.dialpadOutbound) * 1000) / 10 : null,
    coveredDays: acc.coveredDays,
    status,
  };
}

function campaignMatches(call: CrmCallInput, campaign: string) {
  if (campaign === "all") return true;
  if (campaign === "growth") return call.source === "growth";
  if (campaign === "unassigned") return call.source === "lead" && call.campaignId === null;
  return call.source === "lead" && call.campaignId === campaign;
}

export function buildReconciliationReport(input: {
  dialpad: DialpadMergeResult;
  crmCalls: CrmCallInput[];
  agentNames: Map<string, string>; // agentKey -> display name (from the CRMs)
  filters: ReconciliationFilters;
}): ReconciliationReport {
  const { dialpad, filters } = input;
  const dialpadComparable = filters.campaign === "all";
  const inRange = (date: string) => date >= filters.from && date <= filters.to;

  // Agents shown: Dialpad agent-role seats plus anyone with CRM calls. A
  // Dialpad admin seat is excluded from the comparison and reported apart.
  const names = new Map<string, string>(input.agentNames);
  const agentKeys = new Set<string>();
  let adminSeatCalls = 0;
  for (const day of dialpad.days.values()) {
    names.set(day.agentKey, names.get(day.agentKey) ?? day.agentName);
    if (day.agentRole === "agent") agentKeys.add(day.agentKey);
    else if (inRange(day.date)) adminSeatCalls += day.outbound;
  }
  for (const call of input.crmCalls) agentKeys.add(call.agentKey);
  const selected = [...agentKeys].filter((key) => filters.agentKey === "all" || key === filters.agentKey).sort();

  const daily = new Map<string, Accumulator>(); // `${agentKey}|${date}`
  const touch = (key: string) => slot(daily, key);

  // First day each agent logged any call in either CRM (ignoring filters).
  // Dialpad activity before that day predates the CRM call log and is not
  // compared; an agent who has never logged a call is compared throughout, so
  // an agent who simply never logs still shows as a gap.
  const firstCrmDate = new Map<string, string>();
  for (const call of input.crmCalls) {
    const first = firstCrmDate.get(call.agentKey);
    if (!first || call.date < first) firstCrmDate.set(call.agentKey, call.date);
  }

  for (const agentKey of selected) {
    for (const date of dialpad.coveredDates) {
      if (!inRange(date)) continue;
      const acc = touch(`${agentKey}|${date}`);
      const day = dialpad.days.get(`${agentKey}|${date}`);
      const first = firstCrmDate.get(agentKey);
      if (first && date < first) {
        acc.dialpadBeforeCrm = day?.outbound ?? 0;
        continue;
      }
      acc.coveredDays = 1;
      if (day) {
        acc.dialpadOutbound = day.outbound;
        acc.dialpadTotal = day.total;
      }
    }
  }
  const uncoveredActivity = new Set<string>();
  for (const call of input.crmCalls) {
    if (!selected.includes(call.agentKey) || !inRange(call.date) || !campaignMatches(call, filters.campaign)) continue;
    const acc = touch(`${call.agentKey}|${call.date}`);
    if (call.source === "lead") acc.crmLead += call.count;
    else acc.crmGrowth += call.count;
    if (dialpad.coveredDates.has(call.date)) acc.crmComparable += call.count;
    else {
      acc.crmOutsideCoverage += call.count;
      uncoveredActivity.add(call.date);
    }
  }

  const dailyRows: DailyRow[] = [];
  const weekly = new Map<string, Accumulator>();
  const perAgent = new Map<string, Accumulator>();
  const total = emptyAccumulator();
  const addInto = (target: Accumulator, acc: Accumulator) => {
    target.dialpadOutbound += acc.dialpadOutbound;
    target.dialpadTotal += acc.dialpadTotal;
    target.dialpadBeforeCrm += acc.dialpadBeforeCrm;
    target.crmLead += acc.crmLead;
    target.crmGrowth += acc.crmGrowth;
    target.crmComparable += acc.crmComparable;
    target.crmOutsideCoverage += acc.crmOutsideCoverage;
    target.coveredDays += acc.coveredDays;
  };

  for (const [key, acc] of daily) {
    const [agentKey, date] = key.split("|");
    const hasActivity = acc.dialpadOutbound > 0 || acc.dialpadTotal > 0 || acc.dialpadBeforeCrm > 0 || acc.crmLead + acc.crmGrowth > 0;
    if (hasActivity) dailyRows.push({ date, agentKey, agentName: names.get(agentKey) ?? agentKey, ...finalize(acc, dialpadComparable) });
    addInto(slot(weekly, `${agentKey}|${leadgenMondayOf(date)}`), acc);
    addInto(slot(perAgent, agentKey), acc);
    addInto(total, acc);
  }

  const weeklyRows: WeeklyRow[] = [...weekly.entries()]
    .map(([key, acc]) => {
      const [agentKey, weekStart] = key.split("|");
      return { weekStart, weekEnd: addDays(weekStart, 6), agentKey, agentName: names.get(agentKey) ?? agentKey, ...finalize(acc, dialpadComparable) };
    })
    .filter((row) => row.dialpadOutbound > 0 || row.dialpadTotal > 0 || row.dialpadBeforeCrm > 0 || row.crmTotal > 0)
    .sort((a, b) => (a.weekStart === b.weekStart ? a.agentName.localeCompare(b.agentName) : a.weekStart < b.weekStart ? 1 : -1));

  const agentRows: AgentRow[] = selected.map((agentKey) => ({
    agentKey,
    agentName: names.get(agentKey) ?? agentKey,
    ...finalize(perAgent.get(agentKey) ?? emptyAccumulator(), dialpadComparable),
  }));

  dailyRows.sort((a, b) => (a.date === b.date ? a.agentName.localeCompare(b.agentName) : a.date < b.date ? 1 : -1));

  return {
    dialpadComparable,
    agents: agentRows,
    weekly: weeklyRows,
    daily: dailyRows,
    totals: finalize(total, dialpadComparable),
    adminSeatCalls,
    quality: {
      files: dialpad.files,
      duplicateAgentDays: dialpad.duplicateAgentDays,
      conflicts: dialpad.conflicts,
      overlappingDates: dialpad.overlappingDates,
      uncoveredDatesWithCrmActivity: [...uncoveredActivity].sort(),
    },
  };
}

// Buckets raw CRM call timestamps into per-agent, per-Toronto-day counts. The
// loader passes only (agent, timestamp, campaign), never call content.
export function aggregateCrmCalls(
  rows: { agentKey: string; createdAt: string; campaignId: string | null }[],
  source: CrmSource
): CrmCallInput[] {
  const buckets = new Map<string, CrmCallInput>();
  for (const row of rows) {
    const date = leadgenDateKey(row.createdAt);
    const campaignId = source === "lead" ? row.campaignId : null;
    const key = `${row.agentKey}|${date}|${campaignId ?? ""}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { source, agentKey: row.agentKey, date, campaignId, count: 1 });
  }
  return [...buckets.values()];
}
