"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileText } from "lucide-react";
import { CALL_SCRIPT_MAX_LENGTH } from "@/lib/call-list-script-shared";

type Option = { value: string; label: string };

// Admin-only: attach/update the call script for one call list (both CRMs).
//   Growth:    pick a script template (service/campaign) and/or write custom text
//   Lead Gen:  blank = the client's script (edited on the client page); custom text
//              overrides it for this list only
// Saved script is what assigned agents see in this list's workspace, immediately,
// with no deploy. It never touches call logs or any other history.
export default function SegmentScriptPanelClient({
  segmentId,
  templateOptions,
  initialKey,
  initialText,
  saveAction,
  helpText,
}: {
  segmentId: string;
  templateOptions?: Option[];
  initialKey: string;
  initialText: string;
  saveAction: (segmentId: string, key: string | null, text: string) => Promise<{ error?: string }>;
  helpText: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState(initialKey);
  const [text, setText] = useState(initialText);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveAction(segmentId, key || null, text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Script saved. Assigned agents see it now.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <FileText className="h-4 w-4" /> Call Script
      </h2>
      <p className="mt-1 text-[12.5px] text-slate-500">{helpText}</p>
      {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
      {notice && !error && <p className="mt-2 text-[12.5px] text-emerald-700">{notice}</p>}

      {templateOptions && (
        <label className="mt-3 block text-[12.5px] font-semibold text-slate-700">
          Script template
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={isPending}
            className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:opacity-60"
          >
            <option value="">No template</option>
            {templateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-3 block text-[12.5px] font-semibold text-slate-700">
        Custom script (optional)
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isPending}
          maxLength={CALL_SCRIPT_MAX_LENGTH}
          rows={7}
          placeholder="Use [Agent Name] and [Prospect Business Name] where the agent's or prospect's name should appear."
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:opacity-60"
        />
      </label>

      <div className="mt-3 flex justify-end">
        <button type="button" disabled={isPending} onClick={save} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {isPending ? "Saving…" : "Save Script"}
        </button>
      </div>
    </div>
  );
}
