"use client";

import { useState, useTransition } from "react";

type ActionResult = { error?: string };

// Small inline edit affordance for leadgen_call_logs.client_visible_note,
// used only on the admin Call Logs report (AdminCallLogReport) - never on
// the agent's own "Log a Call" form/list (AgentCallLogClient), which this
// deliberately leaves untouched. Defaults to a read-only display; "Edit"
// reveals a textarea + Save/Cancel, matching the same toggle-to-edit
// pattern already used elsewhere in the admin CRM (e.g. LeadDetailClient).
export default function CallLogClientNoteEditor({
  logId,
  initialNote,
  updateAction,
}: {
  logId: string;
  initialNote: string | null | undefined;
  updateAction: (logId: string, note: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNote ?? "");
  const [savedNote, setSavedNote] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <span className="whitespace-pre-wrap text-slate-700">
          {savedNote ? savedNote : <span className="text-slate-400">No client note</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            setValue(savedNote);
            setError(null);
            setEditing(true);
          }}
          className="shrink-0 text-xs font-semibold text-sky-700 hover:text-sky-800"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-[220px] space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-[13px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateAction(logId, value);
              if (result.error) {
                setError(result.error);
                return;
              }
              setSavedNote(value.trim());
              setError(null);
              setEditing(false);
            })
          }
          className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setValue(savedNote);
            setError(null);
            setEditing(false);
          }}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
