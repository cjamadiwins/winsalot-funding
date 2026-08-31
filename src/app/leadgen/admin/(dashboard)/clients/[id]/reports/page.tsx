import Link from "next/link";
import { notFound } from "next/navigation";
import ClientPerformanceReport from "@/components/leadgen/ClientPerformanceReport";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { resolveLeadgenReportPeriod } from "@/lib/leadgen-client-report";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenClientRow } from "@/lib/leadgen-types";

export default async function AdminClientReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireLeadgenAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("leadgen_clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();

  const period = resolveLeadgenReportPeriod(query.from, query.to);
  const report = await loadLeadgenClientReport(admin, client as LeadgenClientRow, period);
  const pagePath = `/leadgen/admin/clients/${id}/reports`;

  return (
    <div>
      <Link href={`/leadgen/admin/clients/${id}`} className="text-sm font-semibold text-sky-700">← Back to {client.name}</Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{client.name} Performance Report</h1>
      <p className="mt-1 text-sm text-slate-500">Client-specific results suitable for review, printing, or sharing.</p>
      <div className="mt-6">
        <ClientPerformanceReport report={report} pagePath={pagePath} downloadPath={`${pagePath}/download`} />
      </div>
    </div>
  );
}
