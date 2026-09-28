"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import type { LeadgenBuiltCallScript } from "@/lib/leadgen-call-script";

// Compact, easy-to-read rendering of one built call script - shared by the
// dashboard Client Call Script card, the Client Detail page, and the Call
// List "View Call Script" panels, so every one of these locations renders
// the exact same wording for the exact same client/prospect pair (brief:
// "The agent should not have to remember which script belongs to which
// client... Keep the script compact and easy to read while the agent is
// actively on a call").
export default function ClientCallScriptPanel({ script, compact = false }: { script: LeadgenBuiltCallScript; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(script.fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (e.g. insecure context, denied
      // permission) - never blocks the agent from reading the script.
    }
  }

  return (
    <div className={`rounded-xl border border-sky-200 bg-sky-50/60 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-700">
          {script.isCustomOverride ? "Complete Call Script" : "Call Script"}
        </h3>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50"
        >
          <Copy className="h-3 w-3" strokeWidth={2.5} />
          {copied ? "Copied!" : "Copy Script"}
        </button>
      </div>

      <div className={`mt-2.5 space-y-2.5 text-sm leading-6 text-slate-800 ${compact ? "text-sm leading-[1.4]" : ""}`}>
        {script.isCustomOverride ? (
          <p className="whitespace-pre-wrap">{script.fullText}</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opening</p>
              {script.opening?.map((line, i) => (
                <p key={i} className="mt-0.5">
                  &ldquo;{line}&rdquo;
                </p>
              ))}
            </div>
            {script.ifInterested && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">If Interested</p>
                <p className="mt-0.5">&ldquo;{script.ifInterested}&rdquo;</p>
              </div>
            )}
            {script.closing && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Closing</p>
                <p className="mt-0.5">&ldquo;{script.closing}&rdquo;</p>
              </div>
            )}
          </>
        )}
      </div>

      {script.notes && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Internal Agent Notes — not for the prospect</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{script.notes}</p>
        </div>
      )}
    </div>
  );
}
