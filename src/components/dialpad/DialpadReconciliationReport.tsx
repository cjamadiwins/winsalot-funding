import Link from "next/link";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";
import type { ReconciliationData } from "@/lib/dialpad-reconciliation-data";
import { STATUS_LABELS, type ReconciliationStatus, type RowFigures } from "@/lib/dialpad-reconciliation";

// Read-only server component. Filters are a plain GET form (no client JS, no
// server actions), so nothing on this page can submit a write.

const STATUS_STYLES: Record<ReconciliationStatus, string> = {
  matched: "bg-emerald-100 text-emerald-800",
  crm_lower: "bg-rose-100 text-rose-800",
  crm_higher: "bg-amber-100 text-amber-800",
  crm_only: "bg-slate-100 text-slate-700",
  before_crm: "bg-violet-100 text-violet-800",
  campaign_filtered: "bg-sky-100 text-sky-800",
};

const card = "rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5 shadow-sm";
const input =
  "mt-1 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-ink-strong)]";
const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]";
const td = "whitespace-nowrap px-3 py-2 text-sm text-[var(--color-ink)]";
const num = `${td} text-right tabular-nums`;

function StatusChip({ status }: { status: ReconciliationStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

function signed(value: number | null) {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function dialpadCell(row: RowFigures, comparable: boolean, value: number) {
  if (comparable && row.status === "before_crm") return `${row.dialpadBeforeCrm} (before CRM)`;
  return comparable && row.coveredDays > 0 ? value : "—";
}

function dateLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function FigureCells({ row, comparable }: { row: RowFigures; comparable: boolean }) {
  return (
    <>
      <td className={num}>{dialpadCell(row, comparable, row.dialpadOutbound)}</td>
      <td className={num}>{row.crmLead}</td>
      <td className={num}>{row.crmGrowth}</td>
      <td className={`${num} font-semibold`}>{row.crmTotal}</td>
      <td className={num}>{signed(row.difference)}</td>
      <td className={num}>{row.coveragePct === null ? "—" : `${row.coveragePct}%`}</td>
      <td className={num}>{comparable && row.coveredDays > 0 ? row.missingFromCrm : "—"}</td>
      <td className={num}>{row.crmOutsideCoverage || "—"}</td>
      <td className={td}>
        <StatusChip status={row.status} />
      </td>
    </>
  );
}

const FIGURE_HEADERS = ["Dialpad outbound", "CRM Lead", "CRM Growth", "CRM total", "CRM − Dialpad", "CRM coverage", "Not found in CRM", "CRM outside Dialpad data", "Status"];

export default function DialpadReconciliationReport({
  data,
  basePath,
  crmLabel,
}: {
  data: ReconciliationData;
  basePath: string; // the CRM's own Dialpad Performance page; this report lives at `${basePath}/reconciliation`
  crmLabel: string;
}) {
  const { report, filters, options } = data;
  const comparable = report.dialpadComparable;
  const q = report.quality;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <Link href={basePath} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)]">
          <ArrowLeft className="h-4 w-4" /> Dialpad Performance
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold text-[var(--color-ink-strong)]">Dialpad ↔ CRM Call Reconciliation</h1>
        <p className="mt-1 flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Read-only report for {crmLabel}{" "}administrators. It compares Dialpad&apos;s outbound call counts with calls logged in both the Lead Generation and
            Growth CRMs. It never creates or changes call records, outcomes, leads or follow-ups.
          </span>
        </p>
      </div>

      <form method="get" className={`${card} grid gap-4 sm:grid-cols-2 lg:grid-cols-5`}>
        <label className="text-sm font-medium text-[var(--color-ink)]">
          Agent
          <select name="agent" defaultValue={filters.agent} className={input}>
            <option value="all">All agents</option>
            {options.agents.map((agent) => (
              <option key={agent.key} value={agent.key}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--color-ink)]">
          Campaign
          <select name="campaign" defaultValue={filters.campaign} className={input}>
            <option value="all">All (compare with Dialpad)</option>
            <option value="growth">Growth CRM (no campaigns)</option>
            <option value="unassigned">Lead CRM — no campaign</option>
            {options.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} · {campaign.calls}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--color-ink)]">
          From
          <input type="date" name="from" defaultValue={filters.from} className={input} />
        </label>
        <label className="text-sm font-medium text-[var(--color-ink)]">
          To
          <input type="date" name="to" defaultValue={filters.to} className={input} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90">
            Apply
          </button>
          <Link href={`${basePath}/reconciliation`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-ink)]">
            Reset
          </Link>
        </div>
      </form>

      {!comparable && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Dialpad exports contain no campaign information, so a campaign filter shows CRM call counts only. Clear the campaign filter to compare with Dialpad.
          </span>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Dialpad outbound (de-duplicated)</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--color-ink-strong)]">{comparable ? report.totals.dialpadOutbound : "—"}</p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Recorded in CRMs</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--color-ink-strong)]">{report.totals.crmTotal}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Lead {report.totals.crmLead} · Growth {report.totals.crmGrowth}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Dialpad calls not found in CRM</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--color-ink-strong)]">{comparable ? report.totals.missingFromCrm : "—"}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Count only — individual calls can&apos;t be identified</p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">CRM calls outside Dialpad data</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--color-ink-strong)]">{report.totals.crmOutsideCoverage}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Days with no Dialpad export — not compared</p>
        </div>
      </section>

      {comparable && report.totals.dialpadBeforeCrm > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {report.totals.dialpadBeforeCrm}{" "}
            Dialpad outbound calls pre-date each agent&apos;s first CRM call log (before call logging started). They are shown
            as &ldquo;Dialpad only&rdquo; and are not counted as missing.
          </span>
        </div>
      )}

      <section className={card}>
        <h2 className="font-heading text-lg font-bold text-[var(--color-ink-strong)]">By agent</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--color-border)]">
            <thead>
              <tr>
                <th className={th}>Agent</th>
                {FIGURE_HEADERS.map((header) => (
                  <th key={header} className={`${th} text-right`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {report.agents.map((row) => (
                <tr key={row.agentKey}>
                  <td className={`${td} font-medium`}>{row.agentName}</td>
                  <FigureCells row={row} comparable={comparable} />
                </tr>
              ))}
              {report.agents.length === 0 && (
                <tr>
                  <td className={td} colSpan={10}>
                    No activity for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-heading text-lg font-bold text-[var(--color-ink-strong)]">By week (Mon–Sun)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--color-border)]">
            <thead>
              <tr>
                <th className={th}>Week</th>
                <th className={th}>Agent</th>
                {FIGURE_HEADERS.map((header) => (
                  <th key={header} className={`${th} text-right`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {report.weekly.map((row) => (
                <tr key={`${row.weekStart}-${row.agentKey}`}>
                  <td className={td}>
                    {dateLabel(row.weekStart)} – {dateLabel(row.weekEnd)}
                  </td>
                  <td className={`${td} font-medium`}>{row.agentName}</td>
                  <FigureCells row={row} comparable={comparable} />
                </tr>
              ))}
              {report.weekly.length === 0 && (
                <tr>
                  <td className={td} colSpan={11}>
                    No activity for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details className={card}>
        <summary className="cursor-pointer font-heading text-lg font-bold text-[var(--color-ink-strong)]">Daily detail ({report.daily.length} agent-days)</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--color-border)]">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Agent</th>
                {FIGURE_HEADERS.map((header) => (
                  <th key={header} className={`${th} text-right`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {report.daily.map((row) => (
                <tr key={`${row.date}-${row.agentKey}`}>
                  <td className={td}>{dateLabel(row.date)}</td>
                  <td className={`${td} font-medium`}>{row.agentName}</td>
                  <FigureCells row={row} comparable={comparable} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className={card}>
        <h2 className="font-heading text-lg font-bold text-[var(--color-ink-strong)]">Data quality &amp; how to read this</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--color-ink)]">
          <li>
            <strong>Overlapping uploads are counted once.</strong> Dialpad figures are keyed by agent and day across {q.files.length} weekly export
            file{q.files.length === 1 ? "" : "s"}. {q.duplicateAgentDays} repeated agent-day{q.duplicateAgentDays === 1 ? "" : "s"} (
            {q.overlappingDates.length > 0 ? q.overlappingDates.map(dateLabel).join(", ") : "none"}) were dropped as exact duplicates.
            {q.conflicts.length > 0 && (
              <span className="font-semibold text-rose-700">
                {" "}
                {q.conflicts.length} day{q.conflicts.length === 1 ? "" : "s"} had conflicting numbers between files — the later export was used:{" "}
                {q.conflicts.map((c) => `${c.agentName} ${dateLabel(c.date)} (${c.kept} vs ${c.dropped})`).join("; ")}.
              </span>
            )}
          </li>
          <li>
            <strong>Counts, not calls.</strong> Dialpad exports hold per-day totals only, so this report shows how many outbound calls differ — not which ones.
            Matching individual calls needs the Dialpad API, which is a separate decision.
          </li>
          <li>
            <strong>Outbound vs. CRM.</strong>{" "}
            The CRM Call Log records outbound call attempts, so it is compared with Dialpad&apos;s outbound count. Differences
            within max(3 calls, 5%) are shown as Matched. Agents can also log calls on a different day or in the other CRM, so weekly and agent totals are more
            reliable than single days.
          </li>
          <li>
            <strong>Days without a Dialpad export</strong> (
            {q.uncoveredDatesWithCrmActivity.length > 0 ? `${q.uncoveredDatesWithCrmActivity.length} day${q.uncoveredDatesWithCrmActivity.length === 1 ? "" : "s"} with CRM calls`: "none in this range"}
            ) are reported under &ldquo;CRM outside Dialpad data&rdquo; and never counted as a difference. Upload the missing weekly User Statistics CSV to fill them.
          </li>
          <li>
            Dates use America/Toronto for CRM calls and the export&apos;s own date for Dialpad; late-evening calls can land on adjacent days.
            {report.adminSeatCalls > 0 && ` The Dialpad admin seat (${report.adminSeatCalls} outbound calls in range) is excluded from agent comparison.`}
          </li>
          {data.skippedFiles.length > 0 && (
            <li className="font-semibold text-rose-700">Could not read: {data.skippedFiles.join(", ")}</li>
          )}
        </ul>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-[var(--color-accent)]">Dialpad export files used</summary>
          <ul className="mt-2 space-y-1 text-[var(--color-text-muted)]">
            {q.files.map((file) => (
              <li key={file.fileName}>
                {file.fileName} — {dateLabel(file.coverageStart)} to {dateLabel(file.coverageEnd)} ({file.agentDays} agent-days)
              </li>
            ))}
          </ul>
        </details>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">Generated {new Date(data.generatedAt).toUTCString()}</p>
      </section>
    </div>
  );
}
