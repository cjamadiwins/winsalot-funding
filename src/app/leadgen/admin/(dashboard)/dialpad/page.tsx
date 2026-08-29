import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadDialpadDashboardData } from "@/lib/dialpad-report-data";
import DialpadPerformanceDashboard from "@/components/dialpad/DialpadPerformanceDashboard";
import { importLeadDialpadReportAction } from "./actions";

export default async function LeadDialpadPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  await requireLeadgenAdmin();
  const { report } = await searchParams;
  const data = await loadDialpadDashboardData(await createSupabaseServerClient(), report);
  return <DialpadPerformanceDashboard workspace="lead" basePath="/leadgen/admin/dialpad" data={data} importAction={importLeadDialpadReportAction} />;
}
