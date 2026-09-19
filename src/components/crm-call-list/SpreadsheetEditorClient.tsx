"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, RefreshCw, Search, AlertTriangle, PhoneOff } from "lucide-react";
import { CALL_LIST_TARGET_FIELDS, CALL_LIST_TARGET_FIELD_LABELS, type CallListTargetField } from "@/lib/call-list-column-mapping";
import type { CallListLeadRow } from "@/lib/call-list-types";

type SortKey = CallListTargetField | "flags";

type LeadEditPatch = Partial<Record<CallListTargetField, string>> & { extra_fields?: Record<string, string> };

export default function SpreadsheetEditorClient({
  segmentId,
  initialLeads,
  updateLeadAction,
  addLeadAction,
  deleteLeadsAction,
  recheckDuplicatesAction,
}: {
  segmentId: string;
  initialLeads: CallListLeadRow[];
  updateLeadAction: (leadId: string, patch: LeadEditPatch, segmentId: string) => Promise<{ error?: string }>;
  addLeadAction: (segmentId: string, fields: Partial<Record<CallListTargetField, string>>) => Promise<{ error?: string }>;
  deleteLeadsAction: (segmentId: string, leadIds: string[]) => Promise<{ error?: string }>;
  recheckDuplicatesAction: (segmentId: string) => Promise<{ error?: string; possibleDuplicates?: number; dncFlagged?: number }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [leads, setLeads] = useState(initialLeads);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extraColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const lead of leads) for (const key of Object.keys(lead.extra_fields ?? {})) keys.add(key);
    return [...keys].sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    let rows = leads;
    if (onlyFlagged) rows = rows.filter((l) => l.is_possible_duplicate || l.dnc_flag);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((l) =>
        [l.business_name, l.contact_name, l.phone, l.email, l.city, l.province, l.industry].some((v) => (v ?? "").toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = sortKey === "flags" ? Number(a.is_possible_duplicate || a.dnc_flag) : ((a[sortKey as keyof CallListLeadRow] as string) ?? "");
        const bv = sortKey === "flags" ? Number(b.is_possible_duplicate || b.dnc_flag) : ((b[sortKey as keyof CallListLeadRow] as string) ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      });
    }
    return rows;
  }, [leads, search, onlyFlagged, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === filteredLeads.length ? new Set() : new Set(filteredLeads.map((l) => l.id))));
  }

  function handleCellEdit(leadId: string, field: CallListTargetField, value: string) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, [field]: value } : l)));
    startTransition(async () => {
      const result = await updateLeadAction(leadId, { [field]: value }, segmentId);
      if (result.error) setError(result.error);
    });
  }

  function handleExtraEdit(leadId: string, key: string, value: string) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, extra_fields: { ...l.extra_fields, [key]: value } } : l)));
    startTransition(async () => {
      const lead = leads.find((l) => l.id === leadId);
      const result = await updateLeadAction(leadId, { extra_fields: { ...(lead?.extra_fields ?? {}), [key]: value } }, segmentId);
      if (result.error) setError(result.error);
    });
  }

  function handleAddRow() {
    setError(null);
    startTransition(async () => {
      const result = await addLeadAction(segmentId, { business_name: "New lead" });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleDelete(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} row${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setError(null);
    setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
    setSelected(new Set());
    startTransition(async () => {
      const result = await deleteLeadsAction(segmentId, ids);
      if (result.error) setError(result.error);
    });
  }

  function handleRecheck() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await recheckDuplicatesAction(segmentId);
      if (result.error) setError(result.error);
      else {
        setNotice(`${result.possibleDuplicates ?? 0} possible duplicate(s), ${result.dncFlagged ?? 0} Do Not Call match(es) flagged.`);
        router.refresh();
      }
    });
  }

  const flaggedCount = leads.filter((l) => l.is_possible_duplicate || l.dnc_flag).length;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rows…"
              className="w-56 rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-[13px]"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            Flagged only ({flaggedCount})
          </label>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => handleDelete([...selected])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-2.5 py-1.5 text-[12.5px] font-medium text-rose-700 hover:border-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={handleRecheck}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} /> Re-check Duplicates
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Row
          </button>
        </div>
      </div>

      <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1100px] text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-2 py-2">
                <input type="checkbox" checked={selected.size > 0 && selected.size === filteredLeads.length} onChange={toggleSelectAll} />
              </th>
              {CALL_LIST_TARGET_FIELDS.map((field) => (
                <th key={field} className="cursor-pointer whitespace-nowrap px-2 py-2 font-semibold" onClick={() => toggleSort(field)}>
                  {CALL_LIST_TARGET_FIELD_LABELS[field]}
                  {sortKey === field && (sortAsc ? " ▲" : " ▼")}
                </th>
              ))}
              {extraColumns.map((col) => (
                <th key={col} className="whitespace-nowrap px-2 py-2 font-semibold">
                  {col}
                </th>
              ))}
              <th className="px-2 py-2 font-semibold">Flags</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className={lead.is_possible_duplicate || lead.dnc_flag ? "bg-amber-50/50" : undefined}>
                <td className="px-2 py-1">
                  <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelected(lead.id)} />
                </td>
                {CALL_LIST_TARGET_FIELDS.map((field) => (
                  <td key={field} className="px-1 py-1">
                    {field === "notes" ? (
                      <textarea
                        defaultValue={lead[field] ?? ""}
                        onBlur={(e) => handleCellEdit(lead.id, field, e.target.value)}
                        rows={1}
                        className="w-full min-w-[120px] resize-y rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none"
                      />
                    ) : (
                      <input
                        defaultValue={lead[field] ?? ""}
                        onBlur={(e) => handleCellEdit(lead.id, field, e.target.value)}
                        className="w-full min-w-[100px] rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none"
                      />
                    )}
                  </td>
                ))}
                {extraColumns.map((col) => (
                  <td key={col} className="px-1 py-1">
                    <input
                      defaultValue={lead.extra_fields?.[col] ?? ""}
                      onBlur={(e) => handleExtraEdit(lead.id, col, e.target.value)}
                      className="w-full min-w-[100px] rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none"
                    />
                  </td>
                ))}
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1">
                    {lead.is_possible_duplicate && (
                      <span title={lead.duplicate_reason ?? "Possible duplicate"} className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> Dup
                      </span>
                    )}
                    {lead.dnc_flag && (
                      <span title="Matches the Do Not Call list" className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-800">
                        <PhoneOff className="h-3 w-3" /> DNC
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1 text-right">
                  <button type="button" onClick={() => handleDelete([lead.id])} aria-label="Delete row" className="text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {filteredLeads.length === 0 && (
              <tr>
                <td colSpan={CALL_LIST_TARGET_FIELDS.length + extraColumns.length + 3} className="px-4 py-6 text-center text-slate-500">
                  No rows match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-slate-500">{leads.length} row(s) total. Edits save automatically when you leave a cell.</p>
    </div>
  );
}
