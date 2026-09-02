"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateCurrentCampaignAction,
  type UpdateCurrentCampaignState,
} from "@/app/leadgen/agent/(dashboard)/actions";

type CampaignOption = {
  id: string;
  businessName: string;
};

const INITIAL_STATE: UpdateCurrentCampaignState = { status: "idle", message: null };

export default function AgentCampaignSelector({ campaigns, currentCampaignId }: { campaigns: CampaignOption[]; currentCampaignId: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(updateCurrentCampaignAction, INITIAL_STATE);

  // currentCampaignId is the server-side source of truth. Keep a controlled
  // value locally so the dropdown and bold client name cannot fall out of
  // sync while the refreshed server component payload is applied.
  const serverSelectedCampaignId = campaigns.some((campaign) => campaign.id === currentCampaignId)
    ? currentCampaignId ?? ""
    : "";
  const [selectedCampaignId, setSelectedCampaignId] = useState(serverSelectedCampaignId);

  useEffect(() => {
    setSelectedCampaignId(serverSelectedCampaignId);
  }, [serverSelectedCampaignId]);

  useEffect(() => {
    if (state.status === "success") router.refresh();
    if (state.status === "error") setSelectedCampaignId(serverSelectedCampaignId);
  }, [router, serverSelectedCampaignId, state.status]);

  const selectedClientName =
    campaigns.find((campaign) => campaign.id === selectedCampaignId)?.businessName ?? "Not selected";

  let statusText = "";
  let statusClass = "text-slate-500";
  if (pending) {
    statusText = "Saving…";
  } else if (state.status === "success") {
    statusText = "Saved";
    statusClass = "text-emerald-600";
  } else if (state.status === "error") {
    statusText = state.message ?? "Could not save your selection.";
    statusClass = "text-rose-600";
  }

  return (
    <section className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 sm:flex sm:items-end sm:justify-between sm:gap-5">
      <div className="min-w-0 flex-1">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Current Client</h2>
        <p className="mt-1 text-[13px] text-slate-600">Select the client you are working for now.</p>
        <p className="mt-2 text-xl font-extrabold uppercase tracking-wide text-slate-900">
          {selectedClientName}
        </p>
      </div>
      <form ref={formRef} action={formAction} className="mt-3 flex min-w-0 flex-col gap-1.5 sm:mt-0 sm:w-80">
        <label htmlFor="current-client" className="text-[12px] font-semibold text-slate-700">
          Select Client / Current Client
        </label>
        <select
          id="current-client"
          name="campaignId"
          value={selectedCampaignId}
          disabled={pending}
          onChange={(event) => {
            setSelectedCampaignId(event.target.value);
            formRef.current?.requestSubmit();
          }}
          className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-[13.5px] font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-wait disabled:opacity-70"
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
      </form>
    </section>
  );
}
