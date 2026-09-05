import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadDialpadDashboardData, ensureLatestDialpadReportImported } from "@/lib/dialpad-report-data";
import DialpadPerformanceDashboard from "@/components/dialpad/DialpadPerformanceDashboard";
import { importGrowthDialpadReportAction } from "./actions";

export default async function GrowthDialpadPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const admin = await requireCrmAdmin();
  const { report } = await searchParams;
  const supabase = await createSupabaseServerClient();
  // Weekly workflow: the latest User Statistics CSV uploaded to the repo
  // is imported automatically, so nobody has to click Import for the
  // dashboard to stay current - see ensureLatestDialpadReportImported().
  await ensureLatestDialpadReportImported({ supabase, workspace: "growth", importedById: admin.id, importedByName: admin.full_name || admin.email });
  const data = await loadDialpadDashboardData(supabase, report);
  return <DialpadPerformanceDashboard workspace="growth" basePath="/admin/crm/dialpad" data={data} importAction={importGrowthDialpadReportAction} />;
}
