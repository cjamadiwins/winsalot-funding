import Link from "next/link";

// Compact "Opportunity Pipeline" summary card shared by all four
// dashboards (Growth CRM admin/agent, Lead Gen CRM admin/agent) - stage
// counts from that CRM's own existing statuses, plus a single "View
// Board" link into that CRM's own Opportunity Finder (Board View). Never
// renders the full Kanban board itself.
export default function OpportunityPipelineSummaryCard({
  stageCounts,
  boardHref,
}: {
  stageCounts: { label: string; count: number; styleClass: string }[];
  boardHref: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Opportunity Pipeline</h2>
        <Link
          href={boardHref}
          className="rounded-full border border-sky-300 bg-sky-50 px-3.5 py-1.5 text-[12px] font-semibold text-sky-700 hover:border-sky-400"
        >
          View Board →
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {stageCounts.map((stage) => (
          <span key={stage.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${stage.styleClass}`}>
            {stage.label}
            <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[11px] font-bold">{stage.count}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
