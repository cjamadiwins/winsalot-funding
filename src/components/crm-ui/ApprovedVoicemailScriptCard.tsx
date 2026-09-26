"use client";

import { useState } from "react";
import { Check, Copy, Phone } from "lucide-react";
import { buildApprovedVoicemailScript, getApprovedVoicemailPhone, type ApprovedVoicemailRole } from "@/lib/approved-voicemail";

export default function ApprovedVoicemailScriptCard({
  agentName,
  email,
  role,
}: {
  agentName?: string | null;
  email?: string | null;
  role?: ApprovedVoicemailRole;
}) {
  const [copied, setCopied] = useState(false);
  const name = agentName?.trim() || "[Agent Name]";
  const phone = getApprovedVoicemailPhone({ email, fullName: agentName, role }) ?? "Contact your administrator for your assigned number";
  const script = buildApprovedVoicemailScript(name, phone);

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-sky-200 bg-[var(--crm-surface)] p-4 shadow-sm sm:p-5" aria-labelledby="approved-voicemail-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-sky-100 p-2.5 text-sky-700">
            <Phone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="approved-voicemail-title" className="text-[15px] font-bold text-slate-900">Approved Voicemail Script</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-600">Use this short voicemail when a prospect does not answer.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={copyScript}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          aria-live="polite"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy Voicemail Script"}
        </button>
      </div>
      <blockquote className="mt-3 whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] leading-5 text-slate-700 sm:px-4">
        {script}
      </blockquote>
    </section>
  );
}
