import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadDialpadDashboardData, ensureLatestDialpadReportImported } from "@/lib/dialpad-report-data";
import DialpadPerformanceDashboard from "@/components/dialpad/DialpadPerformanceDashboard";
import { importLeadDialpadReportAction } from "./actions";

export default async function LeadDialpadPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const admin = await requireLeadgenAdmin();
  const { report } = await searchParams;
  const supabase = await createSupabaseServerClient();
  // Weekly workflow: the latest User Statistics CSV uploaded to the repo
  // is imported automatically, so nobody has to click Import for the
  // dashboard to stay current - see ensureLatestDialpadReportImported().
  await ensureLatestDialpadReportImported({ supabase, workspace: "lead", importedById: admin.id, importedByName: admin.full_name || admin.email });
  const data = await loadDialpadDashboardData(supabase, report);
  return <DialpadPerformanceDashboard workspace="lead" basePath="/leadgen/admin/dialpad" data={data} importAction={importLeadDialpadReportAction} />;
}
