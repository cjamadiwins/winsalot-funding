import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadDialpadDashboardData } from "@/lib/dialpad-report-data";
import DialpadPerformanceDashboard from "@/components/dialpad/DialpadPerformanceDashboard";
import { importGrowthDialpadReportAction } from "./actions";

export default async function GrowthDialpadPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  await requireCrmAdmin();
  const { report } = await searchParams;
  const data = await loadDialpadDashboardData(await createSupabaseServerClient(), report);
  return <DialpadPerformanceDashboard workspace="growth" basePath="/admin/crm/dialpad" data={data} importAction={importGrowthDialpadReportAction} />;
}
