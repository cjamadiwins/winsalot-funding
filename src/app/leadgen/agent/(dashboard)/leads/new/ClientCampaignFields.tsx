"use client";

import { useState } from "react";
import type { LeadgenCampaignRow, LeadgenClientRow } from "@/lib/leadgen-types";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

// Client and Campaign fields need to live together in one client component
// because the Campaign options depend on which Client is currently
// selected - a client-scoped select can't be reactive from a plain server-
// rendered <select>. Switching clients always resets the Campaign field
// back to "No campaign" (via the `key={clientId}` remount below) rather
// than leaving a stale selection from another client's campaign list.
export default function ClientCampaignFields({
  clients,
  campaigns,
  preselectedClientId,
}: {
  clients: LeadgenClientRow[];
  campaigns: LeadgenCampaignRow[];
  preselectedClientId: string;
}) {
  const [clientId, setClientId] = useState(preselectedClientId);
  const campaignsForClient = campaigns.filter((c) => c.client_id === clientId);

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">
          Client<span className="text-red-600"> *</span>
        </span>
        <select
          name="client_id"
          required
          className={inputClass}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="" disabled>
            Select a client…
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Campaign</span>
        <select name="campaign_id" className={inputClass} defaultValue="" key={clientId}>
          <option value="">No campaign</option>
          {campaignsForClient.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
