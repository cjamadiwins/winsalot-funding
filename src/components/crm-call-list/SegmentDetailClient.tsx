"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { RefreshCw, ArrowLeft } from "lucide-react";
import StatusBadge from "@/components/crm-ui/StatusBadge";
import type { CallListSegmentRow, CallListSyncRunRow } from "@/lib/call-list-types";
import type { SegmentSyncResult } from "@/lib/call-list-sync";

export type SegmentLeadView = {
  id: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  status: string;
  assignedAgentName: string;
  archived: boolean;
  createdAt: string;
};

export type SegmentActivityView = {
  id: string;
  type: string;
  notes: string | null;
  occurredAt: string;
};

// Shared, admin-only "one compact performance view" for a single Call
// List Segment - identical shape for both CRMs; each CRM's own detail
// page.tsx supplies its own queries/labels/actions.
export default function SegmentDetailClient({
  basePath,
  segment,
  serviceLabel,
  statusOptions,
  stats,
  leads,
  activities,
  allAgents,
  assignedAgentIds,
  syncRuns,
  filters,
  syncNowAction,
  updateAgentsAction,
  disconnectAction,
  reactivateAction,
}: {
  basePath: string;
  segment: CallListSegmentRow;
  serviceLabel: string;
  statusOptions: string[];
  stats: {
    totalLeads: number;
    leadsRemaining: number;
    callsMade: number;
    interestedLeads: number;
    callbacksDue: number;
    appointmentsBooked: number;
  };
  leads: SegmentLeadView[];
  activities: SegmentActivityView[];
  allAgents: { id: string; name: string }[];
  assignedAgentIds: string[];
  syncRuns: CallListSyncRunRow[];
  filters: { agent: string; status: string; from: string; to: string };
  syncNowAction: (segmentId: string) => Promise<SegmentSyncResult>;
  updateAgentsAction: (segmentId: string, agentIds: string[]) => Promise<{ error?: string }>;
  disconnectAction: (segmentId: string) => Promise<{ error?: string }>;
  reactivateAction: (segmentId: string) => Promise<{ error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ error?: string; note?: string } | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(assignedAgentIds);

  function runAction(fn: () => Promise<{ error?: string } | SegmentSyncResult>, onOk?: (result: unknown) => void) {
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if ("error" in result && result.error) {
        setNotice({ error: result.error });
        return;
      }
      onOk?.(result);
    });
  }

  function handleSyncNow() {
    runAction(
      () => syncNowAction(segment.id),
      (result) => {
        const r = result as SegmentSyncResult;
        setNotice(
          r.status === "error"
            ? { error: r.errors[0]?.message ?? "Sync failed." }
            : {
                note: `Synced: ${r.newLeads} new, ${r.updated} updated, ${r.duplicatesSkipped} duplicates skipped, ${r.dncSkipped} DNC-skipped, ${r.archived} archived${r.errors.length ? `, ${r.errors.length} row error(s)` : ""}.`,
              }
        );
      }
    );
  }

  function toggleAgent(id: string) {
    const next = selectedAgentIds.includes(id) ? selectedAgentIds.filter((a) => a !== id) : [...selectedAgentIds, id];
    setSelectedAgentIds(next);
    runAction(() => updateAgentsAction(segment.id, next));
  }

  const STATUS_STYLES: Record<CallListSegmentRow["status"], string> = {
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
    disconnected: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={basePath} className="inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" /> All segments
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{segment.name}</h1>
          <StatusBadge label={segment.status} className={STATUS_STYLES[segment.status]} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {serviceLabel} · Sheet tab &ldquo;{segment.sheet_tab_name}&rdquo; ·{" "}
          <a href={segment.spreadsheet_url} target="_blank" rel="noreferrer" className="underline">
            Open in Google Sheets
          </a>
        </p>
      </div>

      {notice?.error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{notice.error}</p>}
      {notice?.note && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice.note}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
        <div className="text-sm text-slate-600">
          Last synced: <span className="font-medium text-slate-900">{segment.last_synced_at ? new Date(segment.last_synced_at).toLocaleString() : "Never"}</span>
        </div>
        <div className="flex gap-2">
          {segment.status === "disconnected" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => reactivateAction(segment.id))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              Reactivate
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => disconnectAction(segment.id))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              Disconnect
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={handleSyncNow}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            Sync Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total Leads", stats.totalLeads],
          ["Leads Remaining", stats.leadsRemaining],
          ["Calls Made", stats.callsMade],
          ["Interested", stats.interestedLeads],
          ["Callbacks Due", stats.callbacksDue],
          ["Appointments", stats.appointmentsBooked],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Assigned agents</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {allAgents.length === 0 && <span className="text-sm text-slate-500">No active agents.</span>}
          {allAgents.map((agent) => (
            <button
              type="button"
              key={agent.id}
              disabled={isPending}
              onClick={() => toggleAgent(agent.id)}
              className={`rounded-full border px-3 py-1 text-[12.5px] ${
                selectedAgentIds.includes(agent.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Filters</h2>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">Agent</span>
            <select name="agent" defaultValue={filters.agent} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px]">
              <option value="">All agents</option>
              {allAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">Status</span>
            <select name="status" defaultValue={filters.status} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px]">
              <option value="">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">From</span>
            <input type="date" name="from" defaultValue={filters.from} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">To</span>
            <input type="date" name="to" defaultValue={filters.to} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px]" />
          </label>
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-400">
            Apply
          </button>
          {(filters.agent || filters.status || filters.from || filters.to) && (
            <Link href={`${basePath}/${segment.id}`} className="text-[12.5px] text-slate-500 underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-900">Leads ({leads.length})</h2>
        </div>
        {leads.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No leads match these filters.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Business</th>
                <th className="px-3 py-2 font-semibold">Contact</th>
                <th className="px-3 py-2 font-semibold">Phone</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Agent</th>
                <th className="px-3 py-2 font-semibold">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-3 py-2">
                    {lead.businessName}
                    {lead.archived && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-500">Archived</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{lead.contactName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{lead.phone ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{lead.status}</td>
                  <td className="px-3 py-2 text-slate-600">{lead.assignedAgentName}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(lead.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-900">Call Logs &amp; Notes</h2>
        </div>
        {activities.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No activity logged for this segment yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activities.map((activity) => (
              <li key={activity.id} className="px-3 py-2 text-[13px]">
                <span className="font-medium text-slate-700">{activity.type}</span>{" "}
                <span className="text-slate-500">{new Date(activity.occurredAt).toLocaleString()}</span>
                {activity.notes && <p className="mt-0.5 text-slate-600">{activity.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Sync history</h2>
        {syncRuns.length === 0 ? (
          <p className="text-sm text-slate-500">No syncs yet.</p>
        ) : (
          <ul className="space-y-1.5 text-[12.5px] text-slate-600">
            {syncRuns.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium text-slate-800">{new Date(run.started_at).toLocaleString()}</span>
                <StatusBadge
                  label={run.status}
                  className={
                    run.status === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : run.status === "error"
                        ? "bg-rose-50 text-rose-700"
                        : run.status === "partial"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                  }
                />
                <span>
                  {run.new_leads_count} new · {run.updated_count} updated · {run.duplicates_skipped_count} duplicates · {run.dnc_skipped_count} DNC · {run.archived_count} archived
                  {run.error_count > 0 && ` · ${run.error_count} errors`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
