import Link from "next/link";
import {
  CALL_LOG_OUTCOMES,
  CALL_LOG_OUTCOME_STYLES,
  formatCallLogDate,
  type CallLogRow,
} from "@/lib/call-log";
import CallLogClientNoteEditor from "./CallLogClientNoteEditor";

export type AdminCallLogEntry = CallLogRow & { agentName: string };
export type AdminCallLogAgent = { id: string; name: string };
export type AdminCallLogBusinessClientFilter = {
  options: { id: string; name: string }[];
  selected: string;
};
export type AdminCallLogClientVisibleNote = {
  updateAction: (logId: string, note: string) => Promise<{ error?: string }>;
};

type Props = {
  title: string;
  backHref: string;
  entries: AdminCallLogEntry[];
  agents: AdminCallLogAgent[];
  selectedAgent: string;
  selectedOutcome: string;
  errorMessage?: string | null;
  // Only the Lead Generation CRM (multiple clients) gets this filter -
  // the Growth CRM's Business/Client is always "Winsalot Corp." on every
  // row, so filtering by it would never narrow anything.
  businessClientFilter?: AdminCallLogBusinessClientFilter;
  // Only the Lead Generation CRM passes this - its leadgen_call_logs table
  // has a client_visible_note column and a Client Portal that reads it
  // (src/app/client/(portal)/call-activity/page.tsx); the Growth CRM's
  // crm_call_logs has no such column, so this column is omitted there
  // entirely rather than shown disabled/empty.
  clientVisibleNote?: AdminCallLogClientVisibleNote;
};

export default function AdminCallLogReport({
  title,
  backHref,
  entries,
  agents,
  selectedAgent,
  selectedOutcome,
  errorMessage,
  businessClientFilter,
  clientVisibleNote,
}: Props) {
  return (
    <div>
      <Link href={backHref} className="text-sm font-semibold text-sky-700 hover:text-sky-800">
        ← Back to Agent Performance
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review every call that did not need to be added as a lead or opportunity.
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
          {entries.length} call{entries.length === 1 ? "" : "s"}
        </div>
      </div>

      <form
        className={`mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 ${
          businessClientFilter ? "sm:grid-cols-[1fr_1fr_1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]"
        }`}
      >
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Agent
          <select name="agent" defaultValue={selectedAgent} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900">
            <option value="all">All agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </label>

        {businessClientFilter ? (
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Business / Client
            <select
              name="client"
              defaultValue={businessClientFilter.selected}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900"
            >
              <option value="all">All clients</option>
              {businessClientFilter.options.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Call Result
          <select name="outcome" defaultValue={selectedOutcome} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900">
            <option value="all">All results</option>
            {CALL_LOG_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>{outcome}</option>
            ))}
          </select>
        </label>

        <button type="submit" className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
          Apply Filters
        </button>
      </form>

      {errorMessage ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Call logs could not be loaded: {errorMessage}
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No call logs match these filters.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-[1040px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Business / Client</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Notes</th>
                {clientVisibleNote && <th className="px-4 py-3">Client-Visible Note</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatCallLogDate(entry.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{entry.agentName}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{entry.business_name}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.businessClient}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${CALL_LOG_OUTCOME_STYLES[entry.outcome]}`}>
                      {entry.outcome}
                    </span>
                  </td>
                  <td className="max-w-xl whitespace-pre-wrap px-4 py-3 text-slate-700">{entry.notes}</td>
                  {clientVisibleNote && (
                    <td className="max-w-xs px-4 py-3 text-slate-700">
                      <CallLogClientNoteEditor logId={entry.id} initialNote={entry.client_visible_note} updateAction={clientVisibleNote.updateAction} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
