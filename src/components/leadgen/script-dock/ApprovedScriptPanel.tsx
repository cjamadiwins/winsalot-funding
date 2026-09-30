"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { buildLeadgenCallScript } from "@/lib/leadgen-call-script";
import { buildWebsiteServicesScript, websiteServicesScriptToText } from "@/lib/leadgen-website-script";
import type { ScriptSessionPayload } from "@/lib/leadgen-script-session-types";
import ClientCallScriptPanel from "../ClientCallScriptPanel";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="mt-1 text-[13px] leading-5 text-slate-800">{children}</div>
    </section>
  );
}

// Compact approved-script body for the dock. Agent name and client name are
// always resolved from the viewer and the list's client - nothing here is
// hard-coded per client.
export default function ApprovedScriptPanel({ payload, agentName }: { payload: ScriptSessionPayload; agentName: string }) {
  const [copied, setCopied] = useState(false);

  if (!payload.websiteServices) {
    return <ClientCallScriptPanel script={buildLeadgenCallScript({ agentName, client: payload.client, websiteServices: false })} compact />;
  }

  const script = buildWebsiteServicesScript({
    agentName,
    clientName: payload.clientName,
    campaignLabel: payload.campaignName,
    industry: payload.industry,
    services: payload.client.call_script_services,
    notes: payload.client.call_script_notes,
    closing: payload.client.call_script_closing,
    adminScript: payload.client.call_script_override,
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(websiteServicesScriptToText(script));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable; never blocks reading the script.
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-sky-300 bg-sky-50 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Opening</h4>
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-50">
            <Copy className="h-3 w-3" strokeWidth={2.5} />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p data-testid="approved-opening" className="mt-1 text-[13.5px] leading-5 text-slate-900">&ldquo;{script.opening}&rdquo;</p>
      </div>
      <Section title="Client / Campaign">
        <p>
          <strong>{script.clientName}</strong>
          {script.campaignLabel !== script.clientName ? ` · ${script.campaignLabel}` : ""}
          {script.industry ? ` · ${script.industry}` : ""}
        </p>
      </Section>
      <Section title="Qualification questions">
        <ul className="list-disc space-y-0.5 pl-4">{script.qualificationQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
      </Section>
      <Section title="Key talking points">
        <ul className="list-disc space-y-0.5 pl-4">{script.talkingPoints.map((t) => <li key={t}>{t}</li>)}</ul>
        {script.clientNotes && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[12px] text-amber-900"><strong>Client notes:</strong> {script.clientNotes}</p>}
      </Section>
      <Section title="Objection handling">
        <dl className="space-y-1">
          {script.objections.map((o) => (
            <div key={o.objection}>
              <dt className="font-semibold">{o.objection}</dt>
              <dd>{o.response}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Appointment / CTA">
        <p>&ldquo;{script.cta.line}&rdquo;</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12.5px] text-slate-600">{script.cta.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </Section>
      {script.adminScript && (
        <Section title="Admin campaign script">
          <p className="whitespace-pre-wrap">{script.adminScript}</p>
        </Section>
      )}
    </div>
  );
}
