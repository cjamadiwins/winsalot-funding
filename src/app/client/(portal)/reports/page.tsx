import ClientPerformanceReport from "@/components/leadgen/ClientPerformanceReport";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { resolveLeadgenReportPeriod, buildLeadgenConversionBreakdown } from "@/lib/leadgen-client-report";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { computeClientDashboardSummary } from "@/lib/client-portal-dashboard";
import type { LeadgenAppointmentRow, LeadgenLeadRow } from "@/lib/leadgen-types";

function formatRate(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

export default async function ClientPortalReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ client }, query, supabase] = await Promise.all([requireLeadgenPortalClient(), searchParams, createSupabaseServerClient()]);
  const period = resolveLeadgenReportPeriod(query.from, query.to);
  const report = await loadLeadgenClientReport(supabase, client, period);
  const breakdown = buildLeadgenConversionBreakdown(report);

  // Same all-time query the Dashboard's KPI cards use, so the headline
  // Conversion Rate explained here is guaranteed to be the exact number
  // the "Conversion Rate" card just linked from - never a second,
  // differently-scoped figure with the same name.
  const [{ data: allLeads }, { data: allAppointments }] = await Promise.all([
    supabase.from("leadgen_leads").select("*").eq("client_id", client.id),
    supabase.from("leadgen_appointments").select("*").eq("client_id", client.id),
  ]);
  const allTimeSummary = computeClientDashboardSummary((allLeads ?? []) as LeadgenLeadRow[], (allAppointments ?? []) as LeadgenAppointmentRow[]);
  const allTimeStats = new Map(allTimeSummary.stats.map((s) => [s.label, s.value]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Performance Report</h1>
      <p className="mt-1 text-sm text-slate-500">Review and download your lead generation results.</p>

      <section id="conversion-rate" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Conversion Rate — How It&apos;s Calculated</h2>
        <p className="mt-2 text-[26px] font-extrabold leading-none tracking-tight text-slate-900">{allTimeStats.get("Conversion Rate") ?? 0}%</p>
        <p className="mt-1.5 text-[13px] text-slate-600">
          Completed Appointments ({allTimeStats.get("Completed Appointments") ?? 0}) ÷ Leads Contacted ({allTimeStats.get("Leads Contacted") ?? 0}) × 100, across all leads and appointments generated for your campaign.
        </p>

        <h3 className="mt-5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Deeper Breakdown — {report.period.from} to {report.period.to}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-5">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">Contact Rate</dt>
            <dd className="mt-0.5 text-[18px] font-bold text-slate-900">{formatRate(breakdown.contactRate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">Interested Rate</dt>
            <dd className="mt-0.5 text-[18px] font-bold text-slate-900">{formatRate(breakdown.interestedRate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">Lead → Appointment</dt>
            <dd className="mt-0.5 text-[18px] font-bold text-slate-900">{formatRate(breakdown.leadToAppointmentRate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">Appointment Completion</dt>
            <dd className="mt-0.5 text-[18px] font-bold text-slate-900">{formatRate(breakdown.appointmentCompletionRate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">Appointment → Won</dt>
            <dd className="mt-0.5 text-[18px] font-bold text-slate-900">{formatRate(breakdown.appointmentToWonRate)}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6">
        <ClientPerformanceReport report={report} pagePath="/client/reports" downloadPath="/client/reports/download" />
      </div>
    </div>
  );
}
