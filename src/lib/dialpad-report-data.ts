import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDialpadCsv, resolveDialpadIdentity, extractDateRangeFromCsv, type DialpadWorkspace, type ParsedDialpadReport } from "./dialpad-report";
import { findLatestDialpadUserStatisticsCsv, readDialpadCsvFile } from "./dialpad-csv-source";

export type DialpadReportRow = {
  id: string;
  period_start: string;
  period_end: string;
  source_file_name: string;
  source_workspace: DialpadWorkspace;
  imported_at: string;
  imported_by_name: string;
  user_count: number;
  call_count: number;
};

export type DialpadUserStatRow = {
  id: string;
  report_id: string;
  agent_name: string;
  agent_email: string | null;
  agent_role: "admin" | "agent";
  total_calls: number;
  placed_calls: number;
  answered_calls: number;
  missed_calls: number;
  inbound_calls: number;
  voicemails: number;
  total_duration_seconds: number;
  average_duration_seconds: number;
};

export type DialpadStoredCallRow = {
  id: string;
  report_id: string;
  external_call_id: string | null;
  agent_name: string;
  agent_email: string | null;
  agent_role: "admin" | "agent";
  direction: string;
  call_status: string;
  started_at: string | null;
  duration_seconds: number;
  phone_number: string | null;
};

export type DialpadDashboardData = {
  reports: DialpadReportRow[];
  selectedReport: DialpadReportRow | null;
  summaries: DialpadUserStatRow[];
  calls: DialpadStoredCallRow[];
};

export type DialpadAgentDashboardData = {
  report: DialpadReportRow | null;
  summary: DialpadUserStatRow | null;
};

type UserDirectoryEntry = { full_name: string; email: string; role: string; active: boolean };

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

// The curated DIALPAD_IDENTITIES table (dialpad-report.ts) exists
// specifically for shared Dialpad seats that have no genuine per-person
// CRM record - e.g. a company inbox whose crm_users/leadgen_users row is
// still just its own login email, or (as found for info@winsalotcorp.com)
// a generic company name like "Winsalot Corp" rather than an actual
// person - so it takes priority whenever it has an entry for this email:
// a shared/generic directory row that carries no more real information
// than the CSV already has can never downgrade a name a human already
// curated. Any Dialpad email NOT in that table still prefers a real,
// genuinely per-person directory match over inventing anything ("Use the
// existing Winsalot agent mapping already present in the CRM... Do not
// hardcode assumptions if the mapping already exists").
export function resolveIdentity(
  summary: { agentName: string; agentEmail: string | null },
  directory: UserDirectoryEntry[]
): { agentName: string; agentRole: "admin" | "agent" } {
  const mapped = resolveDialpadIdentity(summary.agentName, summary.agentEmail);
  if (mapped.agentRole) return { agentName: mapped.agentName, agentRole: mapped.agentRole };

  const email = normalized(summary.agentEmail);
  const name = normalized(summary.agentName);
  const matches = directory.filter((user) => (email && normalized(user.email) === email) || (name && normalized(user.full_name) === name));
  const role: "admin" | "agent" = matches.some((user) => user.role === "admin") ? "admin" : matches.length > 0 ? "agent" : "agent";

  const namedMatch = matches.find((user) => user.full_name && normalized(user.full_name) !== normalized(user.email));
  if (namedMatch) return { agentName: namedMatch.full_name, agentRole: role };

  return { agentName: mapped.agentName, agentRole: role };
}

export async function loadDialpadDashboardData(supabase: SupabaseClient, reportId?: string): Promise<DialpadDashboardData> {
  const { data: reports } = await supabase.from("dialpad_call_reports").select("*").order("period_end", { ascending: false }).limit(26);
  const reportRows = (reports ?? []) as DialpadReportRow[];
  const selectedReport = reportRows.find((report) => report.id === reportId) ?? reportRows[0] ?? null;
  if (!selectedReport) return { reports: reportRows, selectedReport: null, summaries: [], calls: [] };

  const [{ data: summaries }, { data: calls }] = await Promise.all([
    supabase.from("dialpad_user_stats").select("*").eq("report_id", selectedReport.id).order("total_calls", { ascending: false }),
    supabase.from("dialpad_call_rows").select("*").eq("report_id", selectedReport.id).order("started_at", { ascending: false }).limit(500),
  ]);

  return {
    reports: reportRows,
    selectedReport,
    summaries: (summaries ?? []) as DialpadUserStatRow[],
    calls: (calls ?? []) as DialpadStoredCallRow[],
  };
}

export async function loadDialpadAgentDashboardData(supabase: SupabaseClient): Promise<DialpadAgentDashboardData> {
  const { data: reports } = await supabase
    .from("dialpad_call_reports")
    .select("*")
    .order("period_end", { ascending: false })
    .limit(1);
  const report = ((reports ?? [])[0] ?? null) as DialpadReportRow | null;
  if (!report) return { report: null, summary: null };

  // RLS (dialpad_user_stats_agent_select_own) already restricts a signed-in
  // agent to only their own row for this report by email-or-name, so no
  // client-side filter is needed - and building one here previously broke
  // on names containing spaces (an unquoted value in a PostgREST .or()
  // filter), silently returning no row even once a real match existed.
  const { data: summary } = await supabase
    .from("dialpad_user_stats")
    .select("*")
    .eq("report_id", report.id)
    .limit(1)
    .maybeSingle();

  return { report, summary: (summary ?? null) as DialpadUserStatRow | null };
}

// Shared by the manual "Import weekly Dialpad CSV" upload action and the
// automatic repo-CSV sync below - the only difference between the two is
// where periodStart/periodEnd/sourceFileName/parsed come from, never how
// the rows get written.
async function insertDialpadReport(params: {
  supabase: SupabaseClient;
  workspace: DialpadWorkspace;
  importedById: string;
  importedByName: string;
  sourceFileName: string;
  periodStart: string;
  periodEnd: string;
  parsed: ParsedDialpadReport;
}): Promise<{ error?: string; success?: string }> {
  const { supabase, workspace, importedById, importedByName, sourceFileName, periodStart, periodEnd, parsed } = params;
  if (parsed.summaries.length === 0) return { error: "No Dialpad users were found in this CSV." };

  const [{ data: crmUsers }, { data: leadgenUsers }] = await Promise.all([
    supabase.from("crm_users").select("full_name,email,role,active").eq("active", true),
    supabase.from("leadgen_users").select("full_name,email,role,active").eq("active", true).in("role", ["admin", "agent"]),
  ]);
  const directory = [...(crmUsers ?? []), ...(leadgenUsers ?? [])] as UserDirectoryEntry[];

  const { data: report, error: reportError } = await supabase
    .from("dialpad_call_reports")
    .insert({
      period_start: periodStart,
      period_end: periodEnd,
      source_file_name: sourceFileName,
      source_workspace: workspace,
      imported_by: importedById,
      imported_by_name: importedByName,
      user_count: parsed.summaries.length,
      call_count: parsed.summaries.reduce((total, summary) => total + summary.totalCalls, 0),
    })
    .select("id")
    .single();
  if (reportError || !report) {
    if (reportError?.code === "23505") return { error: "That Dialpad week has already been imported." };
    return { error: "The report could not be saved." };
  }

  const summaryRows = parsed.summaries.map((summary) => {
    const identity = resolveIdentity(summary, directory);
    return {
      report_id: report.id,
      agent_name: identity.agentName,
      agent_email: summary.agentEmail,
      agent_role: identity.agentRole,
      total_calls: summary.totalCalls,
      placed_calls: summary.placedCalls,
      answered_calls: summary.answeredCalls,
      missed_calls: summary.missedCalls,
      inbound_calls: summary.inboundCalls,
      voicemails: summary.voicemails,
      total_duration_seconds: summary.totalDurationSeconds,
      average_duration_seconds: summary.averageDurationSeconds,
    };
  });
  const { error: summaryError } = await supabase.from("dialpad_user_stats").insert(summaryRows);
  if (summaryError) {
    await supabase.from("dialpad_call_reports").delete().eq("id", report.id);
    return { error: "The per-user Dialpad totals could not be saved." };
  }

  if (parsed.calls.length > 0) {
    const roleByIdentity = new Map(summaryRows.map((summary) => [normalized(summary.agent_email || summary.agent_name), summary.agent_role]));
    const nameByIdentity = new Map(summaryRows.map((summary) => [normalized(summary.agent_email || summary.agent_name), summary.agent_name]));
    for (let index = 0; index < parsed.calls.length; index += 250) {
      const callRows = parsed.calls.slice(index, index + 250).map((call) => {
        const key = normalized(call.agentEmail || call.agentName);
        return {
          report_id: report.id,
          external_call_id: call.externalCallId,
          agent_name: nameByIdentity.get(key) ?? call.agentName,
          agent_email: call.agentEmail,
          agent_role: roleByIdentity.get(key) ?? "agent",
          direction: call.direction,
          call_status: call.status,
          started_at: call.startedAt,
          duration_seconds: call.durationSeconds,
          phone_number: call.phoneNumber,
          raw_data: call.raw,
        };
      });
      const { error: callsError } = await supabase.from("dialpad_call_rows").insert(callRows);
      if (callsError) return { error: "The summary was saved, but some detailed call rows could not be imported." };
    }
  }

  return { success: `Imported ${parsed.summaries.length} users and ${summaryRows.reduce((total, row) => total + row.total_calls, 0)} calls.` };
}

export async function importDialpadCsv(params: {
  supabase: SupabaseClient;
  workspace: DialpadWorkspace;
  importedById: string;
  importedByName: string;
  formData: FormData;
}): Promise<{ error?: string; success?: string }> {
  const { supabase, workspace, importedById, importedByName, formData } = params;
  const file = formData.get("report_file");
  const periodStart = String(formData.get("period_start") ?? "");
  const periodEnd = String(formData.get("period_end") ?? "");

  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return { error: "Choose a Dialpad CSV report." };
  if (file.size > 900_000) return { error: "This CSV is larger than 900 KB. Export one week at a time from Dialpad." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) {
    return { error: "Choose a valid Monday-through-Sunday report period." };
  }

  let parsed: ParsedDialpadReport;
  try {
    parsed = parseDialpadCsv(await file.text());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Dialpad CSV could not be read." };
  }

  return insertDialpadReport({ supabase, workspace, importedById, importedByName, sourceFileName: file.name, periodStart, periodEnd, parsed });
}

export type DialpadSyncResult = { imported?: boolean; fileName?: string; periodStart?: string; periodEnd?: string };

// Automatic counterpart to the manual upload above - the weekly workflow
// is "Dialpad -> User Statistics -> CSV export -> upload CSV to GitHub ->
// CRM automatically displays the latest report", so this looks for the
// latest User Statistics CSV committed to the repo and imports it the
// same way a manual upload would, without anyone clicking Import. Called
// from every Dialpad Performance page load (admin and agent, both CRMs);
// it is a deliberate no-op whenever there's nothing new:
//   - no valid User Statistics CSV in the repo at all,
//   - that period is already imported (dialpad_call_reports' own unique
//     (period_start, period_end) constraint - the same guard the manual
//     upload already relies on), or
//   - the calling session isn't an admin, so the RLS policies that gate
//     every insert here (dialpad_call_reports_admin_all, etc.) reject the
//     write - which is exactly why this is safe to call unconditionally
//     from agent pages too: an agent's own session can never write these
//     tables, sync or not.
// Never throws and never surfaces an error to the page it's called from -
// a bad or unreadable file here should never break a dashboard that
// would otherwise still have a perfectly good previously-imported report
// to show.
export async function ensureLatestDialpadReportImported(params: {
  supabase: SupabaseClient;
  workspace: DialpadWorkspace;
  importedById: string;
  importedByName: string;
}): Promise<DialpadSyncResult> {
  const { supabase, workspace, importedById, importedByName } = params;

  try {
    const candidate = findLatestDialpadUserStatisticsCsv();
    if (!candidate) return {};

    const csvText = readDialpadCsvFile(candidate.filePath);

    let periodStart = candidate.periodStart;
    let periodEnd = candidate.periodEnd;
    // The filename only ever carried a single-day stamp (no explicit
    // range) - cross-check against the CSV's own date column, which is
    // the more reliable source when the two disagree.
    if (periodStart === periodEnd) {
      const fromContents = extractDateRangeFromCsv(csvText);
      if (fromContents) {
        periodStart = fromContents.periodStart;
        periodEnd = fromContents.periodEnd;
      }
    }

    const { data: existing } = await supabase
      .from("dialpad_call_reports")
      .select("id")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();
    if (existing) return { fileName: candidate.fileName, periodStart, periodEnd };

    const parsed = parseDialpadCsv(csvText);
    const result = await insertDialpadReport({
      supabase,
      workspace,
      importedById,
      importedByName,
      sourceFileName: candidate.fileName,
      periodStart,
      periodEnd,
      parsed,
    });
    if (result.error) return {};
    return { imported: true, fileName: candidate.fileName, periodStart, periodEnd };
  } catch {
    return {};
  }
}
