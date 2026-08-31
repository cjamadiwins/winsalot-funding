import Link from "next/link";
import { notFound } from "next/navigation";
import ClientPerformanceReport from "@/components/leadgen/ClientPerformanceReport";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { resolveLeadgenReportPeriod } from "@/lib/leadgen-client-report";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenClientRow } from "@/lib/leadgen-types";

export default async function GrowthClientReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireCrmAdmin();
  const [{ id }, query, supabase] = await Promise.all([params, searchParams, createSupabaseServerClient()]);
  const { data: crmClient } = await supabase.from("crm_clients").select("id, company_name, leadgen_client_id").eq("id", id).maybeSingle();
  if (!crmClient?.leadgen_client_id) notFound();

  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("leadgen_clients").select("*").eq("id", crmClient.leadgen_client_id).maybeSingle();
  if (!client) notFound();
  const period = resolveLeadgenReportPeriod(query.from, query.to);
  const report = await loadLeadgenClientReport(admin, client as LeadgenClientRow, period);
  const pagePath = `/admin/crm/clients/${id}/reports`;

  return (
    <div>
      <Link href={`/admin/crm/clients/${id}`} className="text-sm font-semibold text-sky-700">← Back to {crmClient.company_name}</Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{crmClient.company_name} Performance Report</h1>
      <p className="mt-1 text-sm text-slate-500">Client-specific monthly results suitable for review, download, or sharing.</p>
      <div className="mt-6"><ClientPerformanceReport report={report} pagePath={pagePath} downloadPath={`${pagePath}/download`} /></div>
    </div>
  );
}
