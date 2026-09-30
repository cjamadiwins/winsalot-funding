"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import CampaignQuickScriptCard from "@/components/crm-ui/CampaignQuickScriptCard";
import { substituteAgentName } from "@/lib/call-list-script-shared";
import type { GrowthScriptSessionPayload } from "@/lib/growth-script-session-types";

// Approved Growth script body for the dock: Admin's custom list script when set,
// otherwise the service template - the same precedence the call list page used
// inline. Read-only for agents.
export default function ApprovedScriptPanel({ payload, agentName }: { payload: GrowthScriptSessionPayload; agentName: string }) {
  const [copied, setCopied] = useState(false);
  const name = agentName.trim() || "Winsalot Agent";

  if (!payload.scriptText) {
    return <CampaignQuickScriptCard campaignKey={payload.serviceKey} agentName={name} />;
  }
  const text = substituteAgentName(payload.scriptText, name);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable; never blocks reading the script.
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{payload.serviceLabel}</h4>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
          <Copy className="h-3 w-3" strokeWidth={2.5} /> {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-6 text-slate-800">{text}</p>
    </div>
  );
}
