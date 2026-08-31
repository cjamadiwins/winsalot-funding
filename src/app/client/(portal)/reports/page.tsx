import ClientPerformanceReport from "@/components/leadgen/ClientPerformanceReport";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { resolveLeadgenReportPeriod } from "@/lib/leadgen-client-report";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function ClientPortalReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ client }, query, supabase] = await Promise.all([requireLeadgenPortalClient(), searchParams, createSupabaseServerClient()]);
  const period = resolveLeadgenReportPeriod(query.from, query.to);
  const report = await loadLeadgenClientReport(supabase, client, period);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Performance Report</h1>
      <p className="mt-1 text-sm text-slate-500">Review and download your lead generation results.</p>
      <div className="mt-6">
        <ClientPerformanceReport report={report} pagePath="/client/reports" downloadPath="/client/reports/download" />
      </div>
    </div>
  );
}
