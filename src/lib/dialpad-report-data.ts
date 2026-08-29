import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDialpadCsv, resolveDialpadIdentity, type DialpadWorkspace } from "./dialpad-report";

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

function resolveRole(summary: { agentName: string; agentEmail: string | null }, directory: UserDirectoryEntry[]) {
  const mappedRole = resolveDialpadIdentity(summary.agentName, summary.agentEmail).agentRole;
  if (mappedRole) return mappedRole;
  const email = normalized(summary.agentEmail);
  const name = normalized(summary.agentName);
  const matches = directory.filter((user) => (email && normalized(user.email) === email) || (name && normalized(user.full_name) === name));
  return matches.some((user) => user.role === "admin") ? "admin" : "agent";
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

export async function loadDialpadAgentDashboardData(
  supabase: SupabaseClient,
  agentEmail: string,
  agentName: string
): Promise<DialpadAgentDashboardData> {
  const { data: reports } = await supabase
    .from("dialpad_call_reports")
    .select("*")
    .order("period_end", { ascending: false })
    .limit(1);
  const report = ((reports ?? [])[0] ?? null) as DialpadReportRow | null;
  if (!report) return { report: null, summary: null };

  const { data: summary } = await supabase
    .from("dialpad_user_stats")
    .select("*")
    .eq("report_id", report.id)
    .or(`agent_email.ilike.${agentEmail.trim()},agent_name.ilike.${agentName.trim()}`)
    .limit(1)
    .maybeSingle();

  return { report, summary: (summary ?? null) as DialpadUserStatRow | null };
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

  let parsed;
  try {
    parsed = parseDialpadCsv(await file.text());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Dialpad CSV could not be read." };
  }
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
      source_file_name: file.name,
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

  const summaryRows = parsed.summaries.map((summary) => ({
    report_id: report.id,
    agent_name: summary.agentName,
    agent_email: summary.agentEmail,
    agent_role: resolveRole(summary, directory),
    total_calls: summary.totalCalls,
    placed_calls: summary.placedCalls,
    answered_calls: summary.answeredCalls,
    missed_calls: summary.missedCalls,
    total_duration_seconds: summary.totalDurationSeconds,
    average_duration_seconds: summary.averageDurationSeconds,
  }));
  const { error: summaryError } = await supabase.from("dialpad_user_stats").insert(summaryRows);
  if (summaryError) {
    await supabase.from("dialpad_call_reports").delete().eq("id", report.id);
    return { error: "The per-user Dialpad totals could not be saved." };
  }

  if (parsed.calls.length > 0) {
    const roleByIdentity = new Map(summaryRows.map((summary) => [normalized(summary.agent_email || summary.agent_name), summary.agent_role]));
    for (let index = 0; index < parsed.calls.length; index += 250) {
      const callRows = parsed.calls.slice(index, index + 250).map((call) => ({
        report_id: report.id,
        external_call_id: call.externalCallId,
        agent_name: call.agentName,
        agent_email: call.agentEmail,
        agent_role: roleByIdentity.get(normalized(call.agentEmail || call.agentName)) ?? "agent",
        direction: call.direction,
        call_status: call.status,
        started_at: call.startedAt,
        duration_seconds: call.durationSeconds,
        phone_number: call.phoneNumber,
        raw_data: call.raw,
      }));
      const { error: callsError } = await supabase.from("dialpad_call_rows").insert(callRows);
      if (callsError) return { error: "The summary was saved, but some detailed call rows could not be imported." };
    }
  }

  return { success: `Imported ${parsed.summaries.length} users and ${summaryRows.reduce((total, row) => total + row.total_calls, 0)} calls.` };
}
