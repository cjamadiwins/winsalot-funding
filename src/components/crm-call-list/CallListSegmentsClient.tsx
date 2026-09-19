"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import StatusBadge from "@/components/crm-ui/StatusBadge";
import type { CallListSegmentRow } from "@/lib/call-list-types";
import type { SegmentSyncResult } from "@/lib/call-list-sync";

// Shared between the Growth CRM and Lead Generation CRM Call List
// Segments list pages - both pass the same row shape and a
// crm-appropriate syncNowAction, so the table/empty-state/sync-status
// presentation stays identical instead of drifting between the two CRMs.
export type CallListSegmentRowView = {
  segment: CallListSegmentRow;
  serviceLabel: string;
  agentNames: string[];
};

const STATUS_STYLES: Record<CallListSegmentRow["status"], string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  error: "bg-rose-50 text-rose-700",
  disconnected: "bg-slate-100 text-slate-600",
};

export default function CallListSegmentsClient({
  basePath,
  rows,
  syncNowAction,
}: {
  basePath: string;
  rows: CallListSegmentRowView[];
  syncNowAction: (segmentId: string) => Promise<SegmentSyncResult>;
}) {
  const [isPending, startTransition] = useTransition();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { error?: string; note?: string }>>({});

  function handleSyncNow(segmentId: string) {
    setSyncingId(segmentId);
    setFeedback((prev) => ({ ...prev, [segmentId]: {} }));
    startTransition(async () => {
      try {
        const result = await syncNowAction(segmentId);
        const note =
          result.status === "error"
            ? result.errors[0]?.message ?? "Sync failed."
            : `Synced: ${result.newLeads} new, ${result.updated} updated, ${result.duplicatesSkipped} duplicates skipped, ${result.dncSkipped} DNC-skipped, ${result.archived} archived${result.errors.length ? `, ${result.errors.length} row error(s)` : ""}.`;
        setFeedback((prev) => ({ ...prev, [segmentId]: result.status === "error" ? { error: note } : { note } }));
      } catch (err) {
        setFeedback((prev) => ({ ...prev, [segmentId]: { error: err instanceof Error ? err.message : "Sync failed." } }));
      } finally {
        setSyncingId(null);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">No Call List Segments yet.</p>
        <p className="mt-1 text-sm text-slate-500">Connect a Google Sheet tab to create the first one.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Segment</th>
            <th className="px-3 py-2 font-semibold">Service / Campaign</th>
            <th className="px-3 py-2 font-semibold">Assigned Agents</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Last Synced</th>
            <th className="px-3 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ segment, serviceLabel, agentNames }) => {
            const rowFeedback = feedback[segment.id];
            const isSyncingThis = isPending && syncingId === segment.id;
            return (
              <tr key={segment.id} className="align-top">
                <td className="px-3 py-2.5">
                  <Link href={`${basePath}/${segment.id}`} className="font-semibold text-slate-900 hover:underline">
                    {segment.name}
                  </Link>
                  <div className="mt-0.5 text-[11.5px] text-slate-500">{segment.sheet_tab_name}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{serviceLabel}</td>
                <td className="px-3 py-2.5 text-slate-700">{agentNames.length > 0 ? agentNames.join(", ") : "Unassigned"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={segment.status} className={STATUS_STYLES[segment.status]} />
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {segment.last_synced_at ? new Date(segment.last_synced_at).toLocaleString() : "Never synced"}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSyncNow(segment.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingThis ? "animate-spin" : ""}`} />
                    {isSyncingThis ? "Syncing…" : "Sync Now"}
                  </button>
                  {rowFeedback?.note && <p className="mt-1 max-w-[220px] text-[11.5px] text-emerald-700">{rowFeedback.note}</p>}
                  {rowFeedback?.error && <p className="mt-1 max-w-[220px] text-[11.5px] text-rose-700">{rowFeedback.error}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
