"use client";

import { useOptimistic, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { updateCurrentCampaignAction } from "@/app/leadgen/agent/(dashboard)/actions";
import { LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS } from "@/lib/leadgen-agent-campaigns";
import { BrentsEssentialsCallScript, MantraCollabCallScript } from "./leadgen-call-scripts";

type CampaignOption = {
  id: string;
  businessName: string;
};

export default function AgentCampaignSelector({
  campaigns,
  currentCampaignId,
  agentFullName,
}: {
  campaigns: CampaignOption[];
  currentCampaignId: string | null;
  agentFullName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // leadgen_users.current_campaign_id, as passed down from the server on
  // every render, is the only source of truth. If it isn't one of the
  // campaigns this dashboard shows, the selection is treated as cleared
  // rather than silently pointing at a hidden campaign.
  const confirmedCampaignId = campaigns.some((campaign) => campaign.id === currentCampaignId) ? currentCampaignId : null;

  // useOptimistic - not a plain useState mirror - is what keeps this from
  // regressing into the bug this replaced: it always collapses back to
  // `confirmedCampaignId` once the pending transition finishes, so there is
  // no separate client value that can drift, or get stuck reset to "".
  // The previous version wrapped this in a <form action={...}>, which made
  // React auto-reset the uncontrolled <select> to its ORIGINAL mount-time
  // defaultValue on every successful submit - that's exactly why the
  // dropdown kept snapping back to "Not selected" even though the save (and
  // the script section, which read the server value directly) was correct.
  // Calling the server action directly, from a controlled <select>, avoids
  // that reset entirely.
  const [optimisticCampaignId, setOptimisticCampaignId] = useOptimistic(
    confirmedCampaignId,
    (_current, next: string | null) => next
  );

  const selectedCampaign = campaigns.find((campaign) => campaign.id === optimisticCampaignId) ?? null;
  const scriptKey = optimisticCampaignId ? (LEADGEN_AGENT_DASHBOARD_CAMPAIGN_SCRIPTS[optimisticCampaignId] ?? null) : null;
  const businessLabel = selectedCampaign ? selectedCampaign.businessName.toUpperCase() : "NOT SELECTED";

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextId = event.target.value || null;
    setErrorMessage(null);
    setJustSaved(false);

    startTransition(async () => {
      setOptimisticCampaignId(nextId);

      const formData = new FormData();
      if (nextId) formData.set("campaignId", nextId);

      const result = await updateCurrentCampaignAction({ status: "idle", message: null }, formData);

      if (result.status === "error") {
        // No revalidation happened, so `confirmedCampaignId` - and the
        // dropdown/bold name/script all derived from it - fall straight
        // back to the last known-good saved value once this transition
        // settles.
        setErrorMessage(result.message ?? "Could not save your selection. Please try again.");
        return;
      }

      setJustSaved(true);
      // Belt-and-suspenders alongside the server action's own
      // revalidatePath(): make sure this route's server-rendered props
      // (leadgen_users.current_campaign_id) are re-fetched now.
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
    <section className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="sm:flex sm:items-end sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Current Business</h2>
          <p className="mt-1 text-[13px] text-slate-600">Select the business you are working on now.</p>
        </div>
        <div className="mt-3 flex min-w-0 flex-col gap-1.5 sm:mt-0 sm:w-80">
          <label htmlFor="current-campaign" className="text-[12px] font-semibold text-slate-700">
            Select Business / Current Business
          </label>
          <select
            id="current-campaign"
            value={optimisticCampaignId ?? ""}
            onChange={handleChange}
            disabled={isPending}
            className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-[13.5px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:opacity-70"
          >
            <option value="">Not selected</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.businessName}
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

      <div className="mt-4 rounded-xl border border-sky-300 bg-white px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current Business</div>
        <div className="mt-1 text-2xl font-extrabold uppercase tracking-tight text-slate-900 sm:text-3xl">{businessLabel}</div>
      </div>

      <div className="mt-4 border-t border-sky-200 pt-4">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Current Business Call Script</h3>
        {scriptKey === null && <p className="mt-2 text-[13.5px] text-slate-600">Select a business to view its call script.</p>}
        {scriptKey === "brents-essentials" && (
          <div className="mt-3 text-[13.5px] leading-6 text-slate-700">
            <BrentsEssentialsCallScript agentFullName={agentFullName} />
          </div>
        )}
        {scriptKey === "mantra-collab" && (
          <div className="mt-3 text-[13.5px] leading-6 text-slate-700">
            <MantraCollabCallScript agentFullName={agentFullName} />
          </div>
        )}
      </div>
    </section>
  );
}
