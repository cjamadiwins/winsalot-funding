"use client";

import { useState, type ChangeEvent } from "react";
import { GROWTH_CRM_CAMPAIGN_KEYS, GROWTH_CRM_CAMPAIGN_LABELS, type GrowthCrmCampaignKey } from "@/lib/growth-crm-campaign-scripts";
import CampaignQuickScriptCard from "./CampaignQuickScriptCard";

// Admin dashboard's Quick Call Script card - lets an admin preview any
// campaign's script on demand (unlike the agent card, this selection is
// local-only, not persisted - an admin isn't "currently calling" a
// campaign the way an agent is). Renders the same colored
// CampaignQuickScriptCard the agent dashboard does, so admin and agent
// never see the script worded or colored differently, with the literal
// "[Agent Name]" placeholder (same convention the Lead Generation CRM's
// Training page uses for the un-substituted name).
export default function AdminCampaignScriptCard() {
  const [campaignKey, setCampaignKey] = useState<GrowthCrmCampaignKey | null>(null);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setCampaignKey((event.target.value || null) as GrowthCrmCampaignKey | null);
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="sm:flex sm:items-end sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Quick Call Script</h2>
          <p className="mt-1 text-[13px] text-slate-600">Preview the call script for any campaign.</p>
        </div>
        <div className="mt-3 flex min-w-0 flex-col gap-1.5 sm:mt-0 sm:w-80">
          <label htmlFor="admin-crm-campaign" className="text-[12px] font-semibold text-slate-700">
            Campaign
          </label>
          <select
            id="admin-crm-campaign"
            value={campaignKey ?? ""}
            onChange={handleChange}
            className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-[13.5px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          >
            <option value="">Select a campaign…</option>
            {GROWTH_CRM_CAMPAIGN_KEYS.map((key) => (
              <option key={key} value={key}>
                {GROWTH_CRM_CAMPAIGN_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CampaignQuickScriptCard campaignKey={campaignKey} agentName="[Agent Name]" />
    </section>
  );
}
