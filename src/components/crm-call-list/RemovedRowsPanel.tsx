"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { CallListLeadRow } from "@/lib/call-list-types";

// Admin-only "Removed Rows" section for a Call List Segment - shows rows an
// Admin removed from the active list (see SpreadsheetEditorClient's Remove
// Selected) and lets them be restored. Nothing here is ever a permanent
// delete; restoring returns a row's full original data to the segment's
// active list untouched. Rendered from both the Draft editor page and the
// deployed/performance page so removed rows stay reachable at any segment
// status.
export default function RemovedRowsPanel({
  segmentId,
  initialRemovedLeads,
  restoreAction,
  onRestored,
}: {
  segmentId: string;
  initialRemovedLeads: CallListLeadRow[];
  restoreAction: (segmentId: string, leadIds: string[]) => Promise<{ error?: string }>;
  onRestored?: (rows: CallListLeadRow[]) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [removedLeads, setRemovedLeads] = useState(initialRemovedLeads);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRows = useMemo(() => removedLeads.filter((l) => selected.has(l.id)), [removedLeads, selected]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === removedLeads.length ? new Set() : new Set(removedLeads.map((l) => l.id))));
  }

  function handleRestore() {
    if (selectedRows.length === 0) return;
    const ids = selectedRows.map((l) => l.id);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await restoreAction(segmentId, ids);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRemovedLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSelected(new Set());
      setNotice(`${ids.length} row${ids.length > 1 ? "s" : ""} restored successfully.`);
      onRestored?.(selectedRows.map((row) => ({ ...row, removed_at: null, removed_by: null })));
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] font-semibold text-slate-700"
      >
        <span className="inline-flex items-center gap-1.5">
          <Archive className="h-3.5 w-3.5" /> Removed Rows ({removedLeads.length})
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3">
          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
          {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">{notice}</p>}

          {removedLeads.length === 0 ? (
            <p className="px-1 py-2 text-[12.5px] text-slate-500">No rows have been removed from this segment.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === removedLeads.length} onChange={toggleSelectAll} />
                  Select all
                </label>
                {selected.size > 0 && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleRestore}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-[12.5px] font-medium text-emerald-700 hover:border-emerald-400 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore Selected ({selected.size})
                  </button>
                )}
              </div>

              <div className="max-h-[40vh] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[900px] text-left text-[12.5px]">
                  <thead className="sticky top-0 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2 font-semibold">Business Name</th>
                      <th className="px-2 py-2 font-semibold">Contact Name</th>
                      <th className="px-2 py-2 font-semibold">Phone</th>
                      <th className="px-2 py-2 font-semibold">Email</th>
                      <th className="px-2 py-2 font-semibold">Website</th>
                      <th className="px-2 py-2 font-semibold">City</th>
                      <th className="px-2 py-2 font-semibold">Province</th>
                      <th className="px-2 py-2 font-semibold">Industry</th>
                      <th className="px-2 py-2 font-semibold">Date Removed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {removedLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelected(lead.id)} />
                        </td>
                        <td className="px-2 py-1.5">{lead.business_name}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.contact_name ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.phone ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.email ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.website ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.city ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.province ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.industry ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{lead.removed_at ? new Date(lead.removed_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
