"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3 } from "lucide-react";
import { defaultHiddenColumnFields } from "@/lib/call-list-columns";

// Admin-only "Manage Columns" control for the Call List spreadsheet -
// display-only column hiding (never touches call_list_leads/Supabase
// data). Checkboxes are staged locally (checked = will be visible) and
// only take effect once an action button is pressed - "Select All"
// stages every column as visible without saving yet, "Hide Selected"
// saves whatever's currently checked/unchecked, and "Show All" /
// "Reset to Default" both stage AND save immediately (no extra click).
// Shared by SpreadsheetEditorClient and SegmentPerformanceClient in both
// CRMs, so Admin manages the same underlying CRM-wide setting from
// either view.
export default function ManageColumnsPopover({
  availableColumns,
  extraFieldNames,
  initialHiddenFields,
  updateAction,
  onHiddenFieldsChange,
}: {
  availableColumns: { key: string; label: string }[];
  extraFieldNames: string[];
  initialHiddenFields: string[];
  updateAction: (hiddenFields: string[]) => Promise<{ error?: string }>;
  onHiddenFieldsChange?: (hiddenFields: string[]) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHiddenFields));
  const [checked, setChecked] = useState<Set<string>>(() => new Set(availableColumns.map((c) => c.key).filter((k) => !initialHiddenFields.includes(k))));
  const [error, setError] = useState<string | null>(null);

  const hiddenCount = hidden.size;

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function persist(nextChecked: Set<string>) {
    const nextHidden = availableColumns.map((c) => c.key).filter((k) => !nextChecked.has(k));
    setError(null);
    startTransition(async () => {
      const result = await updateAction(nextHidden);
      if (result.error) {
        setError(result.error);
        return;
      }
      setHidden(new Set(nextHidden));
      onHiddenFieldsChange?.(nextHidden);
      router.refresh();
    });
  }

  function handleSelectAll() {
    setChecked(new Set(availableColumns.map((c) => c.key)));
  }

  function handleHideSelected() {
    persist(checked);
  }

  function handleShowAll() {
    const all = new Set(availableColumns.map((c) => c.key));
    setChecked(all);
    persist(all);
  }

  function handleResetToDefault() {
    const defaultHidden = new Set(defaultHiddenColumnFields(extraFieldNames));
    const defaultVisible = new Set(availableColumns.map((c) => c.key).filter((k) => !defaultHidden.has(k)));
    setChecked(defaultVisible);
    persist(defaultVisible);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-slate-400"
      >
        <Columns3 className="h-3.5 w-3.5" /> Manage Columns{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold text-slate-900">Manage Columns</span>
              {isPending && <span className="text-[11px] text-slate-400">Saving…</span>}
            </div>
            {error && <p className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700">{error}</p>}

            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {availableColumns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-[12.5px] text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" checked={checked.has(col.key)} onChange={() => toggle(col.key)} />
                  {col.label}
                </label>
              ))}
              {availableColumns.length === 0 && <p className="px-1 py-1 text-[12px] text-slate-500">No columns to manage yet.</p>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleSelectAll}
                className="rounded-lg border border-slate-300 px-2 py-1 text-[11.5px] font-medium text-slate-700 hover:border-slate-400"
              >
                Select All
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleHideSelected}
                className="rounded-lg border border-rose-300 px-2 py-1 text-[11.5px] font-medium text-rose-700 hover:border-rose-400 disabled:opacity-50"
              >
                Hide Selected
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleShowAll}
                className="rounded-lg border border-emerald-300 px-2 py-1 text-[11.5px] font-medium text-emerald-700 hover:border-emerald-400 disabled:opacity-50"
              >
                Show All
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleResetToDefault}
                className="rounded-lg border border-slate-300 px-2 py-1 text-[11.5px] font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
              >
                Reset to Default
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Hiding a column only changes this display - imported data, Call Logs, and notes are never affected.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
