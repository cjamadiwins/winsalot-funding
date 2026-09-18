"use client";

import { useOptimistic, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { updateCrmCurrentCampaignAction } from "@/app/agent/(dashboard)/campaign-actions";
import { GROWTH_CRM_CAMPAIGN_KEYS, GROWTH_CRM_CAMPAIGN_LABELS, type GrowthCrmCampaignKey } from "@/lib/growth-crm-campaign-scripts";
import CampaignQuickScriptCard from "./CampaignQuickScriptCard";

// Agent dashboard's Quick Call Script card - lets the agent pick which
// campaign they're presently calling for (persisted to
// crm_users.current_campaign_key) and shows only that campaign's script,
// color-coded. Mirrors the Lead Generation CRM's AgentCampaignSelector
// (src/components/leadgen/AgentCampaignSelector.tsx), including the
// useOptimistic pattern that keeps the dropdown from ever regressing to
// the "snaps back to Not selected" bug that pattern's own comments
// describe - it always collapses back to the last server-confirmed value,
// never a separately-drifting client value.
export default function AgentCampaignScriptCard({
  currentCampaignKey,
  agentName,
}: {
  currentCampaignKey: GrowthCrmCampaignKey | null;
  agentName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [optimisticCampaignKey, setOptimisticCampaignKey] = useOptimistic(
    currentCampaignKey,
    (_current, next: GrowthCrmCampaignKey | null) => next
  );

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextKey = (event.target.value || null) as GrowthCrmCampaignKey | null;
    setErrorMessage(null);
    setJustSaved(false);

    startTransition(async () => {
      setOptimisticCampaignKey(nextKey);

      const result = await updateCrmCurrentCampaignAction(nextKey);

      if (result.status === "error") {
        setErrorMessage(result.message ?? "Could not save your campaign selection. Please try again.");
        return;
      }

      setJustSaved(true);
      router.refresh();
    });
  }

  let statusText = "";
  let statusClass = "text-slate-500";
  if (isPending) {
    statusText = "Saving…";
  } else if (errorMessage) {
    statusText = errorMessage;
    statusClass = "text-rose-600";
  } else if (justSaved) {
    statusText = "Saved";
    statusClass = "text-emerald-600";
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="sm:flex sm:items-end sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Quick Call Script</h2>
          <p className="mt-1 text-[13px] text-slate-600">Select the campaign you&apos;re currently calling for.</p>
        </div>
        <div className="mt-3 flex min-w-0 flex-col gap-1.5 sm:mt-0 sm:w-80">
          <label htmlFor="current-crm-campaign" className="text-[12px] font-semibold text-slate-700">
            Current Campaign
          </label>
          <select
            id="current-crm-campaign"
            value={optimisticCampaignKey ?? ""}
            onChange={handleChange}
            disabled={isPending}
            className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-[13.5px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-70"
          >
            <option value="">Not selected</option>
            {GROWTH_CRM_CAMPAIGN_KEYS.map((key) => (
              <option key={key} value={key}>
                {GROWTH_CRM_CAMPAIGN_LABELS[key]}
              </option>
            ))}
          </select>
          {statusText && (
            <span aria-live="polite" className={`text-[12px] font-medium ${statusClass}`}>
              {statusText}
            </span>
          )}
        </div>
      </div>

      <CampaignQuickScriptCard campaignKey={optimisticCampaignKey} agentName={agentName} />
    </section>
  );
}
