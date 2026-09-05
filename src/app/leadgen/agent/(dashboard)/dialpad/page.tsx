import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadDialpadDashboardData, ensureLatestDialpadReportImported } from "@/lib/dialpad-report-data";
import DialpadPerformanceDashboard from "@/components/dialpad/DialpadPerformanceDashboard";

export default async function LeadgenAgentDialpadPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const user = await requireLeadgenAgent();
  const { report } = await searchParams;
  const supabase = await createSupabaseServerClient();
  // Best-effort only: an agent's own session can never write these
  // tables (RLS requires an admin role on every insert here), so this is
  // just a harmless no-op unless no admin has opened the dashboard yet.
  await ensureLatestDialpadReportImported({ supabase, workspace: "lead", importedById: user.id, importedByName: user.full_name || user.email });
  // RLS (dialpad_user_stats_agent_select_own / dialpad_call_rows_agent_select_own
  // / dialpad_call_reports_agent_select_own) already restricts a signed-in
  // agent's session client to only their own row per report, so this reuses
  // the exact same admin query with no extra filtering needed here.
  const data = await loadDialpadDashboardData(supabase, report);
  return <DialpadPerformanceDashboard workspace="lead" basePath="/leadgen/agent/dialpad" data={data} audience="agent" />;
}
