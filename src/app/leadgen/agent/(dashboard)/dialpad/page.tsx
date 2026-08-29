import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadDialpadDashboardData } from "@/lib/dialpad-report-data";
import DialpadPerformanceDashboard from "@/components/dialpad/DialpadPerformanceDashboard";

export default async function LeadgenAgentDialpadPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  await requireLeadgenAgent();
  const { report } = await searchParams;
  // RLS (dialpad_user_stats_agent_select_own / dialpad_call_rows_agent_select_own
  // / dialpad_call_reports_agent_select_own) already restricts a signed-in
  // agent's session client to only their own row per report, so this reuses
  // the exact same admin query with no extra filtering needed here.
  const data = await loadDialpadDashboardData(await createSupabaseServerClient(), report);
  return <DialpadPerformanceDashboard workspace="lead" basePath="/leadgen/agent/dialpad" data={data} audience="agent" />;
}
