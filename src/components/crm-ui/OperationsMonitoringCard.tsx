import Link from "next/link";
import { ShieldAlert } from "lucide-react";

// Operations Monitoring's one compact Admin-only dashboard card - shared
// by both the Growth CRM and Lead Generation CRM admin dashboards (same
// "shared crm-ui presentational component, per-CRM business logic" split
// as KpiCard/CrmCardModal). Deliberately just a summary + "View
// Monitoring" link into the full detail page - never six separate large
// cards on the dashboard itself.
export type MonitoringCardCategory = {
  key: string;
  label: string;
  headline: string;
  status: "Healthy" | "Needs Attention" | "Action Required";
};

const STATUS_DOT: Record<MonitoringCardCategory["status"], string> = {
  Healthy: "bg-emerald-500",
  "Needs Attention": "bg-amber-500",
  "Action Required": "bg-rose-500",
};

export default function OperationsMonitoringCard({
  actionRequiredCount,
  warningCount,
  healthyCount,
  categories,
  href,
}: {
  actionRequiredCount: number;
  warningCount: number;
  healthyCount: number;
  categories: MonitoringCardCategory[];
  href: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface,#ffffff)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-slate-500" strokeWidth={2.2} />
          <h2 className="text-base font-bold text-slate-900">Operations Monitoring</h2>
        </div>
        <Link
          href={href}
          className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[length:var(--crm-shared-body,12.5px)] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          View Monitoring
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[length:var(--crm-shared-body,13px)]">
        <span className="font-semibold text-rose-700">{actionRequiredCount} Action Required</span>
        <span className="font-semibold text-amber-700">{warningCount} Warning{warningCount === 1 ? "" : "s"}</span>
        <span className="font-semibold text-emerald-700">{healthyCount} Healthy</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {categories.map((c) => (
          <div key={c.key} className="flex items-center gap-1.5 text-[length:var(--crm-shared-body,12.5px)] text-slate-600">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} aria-hidden="true" />
            <dt className="shrink-0 font-medium text-slate-500">{c.label}:</dt>
            <dd className="truncate text-slate-800">{c.headline}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
