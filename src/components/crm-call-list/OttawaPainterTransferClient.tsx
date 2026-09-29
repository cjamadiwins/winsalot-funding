"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type LeadOption = { id: string; business_name: string; phone: string | null };
type CampaignOption = { id: string; name: string; status: string; clientName: string };

export default function OttawaPainterTransferClient({
  sourceSegmentId,
  leads,
  targetCampaign,
  transferAction,
}: {
  sourceSegmentId: string;
  leads: LeadOption[];
  targetCampaign: CampaignOption;
  transferAction: (sourceSegmentId: string, leadId: string, targetCampaignId: string) => Promise<{ error?: string; destinationSegmentId?: string }>;
}) {
  const [leadId, setLeadId] = useState("");
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">Move one Ottawa lead to {targetCampaign.clientName}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Admin only. The lead keeps its ID, notes, call history, callbacks, DNC status and historical appointments. Its current campaign changes, and the move is recorded.
      </p>
      <p className="mt-1 text-sm text-slate-600">Promoted leads are held for a separate reporting review before transfer.</p>
      {targetCampaign.status !== "active" && (
        <p className="mt-2 text-sm text-amber-700">{targetCampaign.clientName} is paused. Activate its campaign before transferring a lead.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="ottawa-transfer-lead" className="text-sm font-medium text-slate-700">Lead</label>
        <select id="ottawa-transfer-lead" value={leadId} onChange={(event) => { setLeadId(event.target.value); setMessage(""); setDestination(null); }}
          className="max-w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={pending}>
          <option value="">Select a business</option>
          {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.business_name}{lead.phone ? ` · ${lead.phone}` : ""}</option>)}
        </select>
        <button type="button" disabled={pending || !leadId || targetCampaign.status !== "active"}
          onClick={() => startTransition(async () => {
            const result = await transferAction(sourceSegmentId, leadId, targetCampaign.id);
            if (result.error) { setMessage(result.error); return; }
            setMessage("Lead moved successfully. Its history remains on the same record.");
            setDestination(result.destinationSegmentId ?? null);
            setLeadId("");
          })}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Moving…" : `Move to ${targetCampaign.clientName}`}
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
      {destination && <Link className="mt-2 inline-block text-sm font-medium text-blue-700 underline" href={`/leadgen/admin/call-list-segments/${destination}`}>View destination segment</Link>}
    </section>
  );
}
