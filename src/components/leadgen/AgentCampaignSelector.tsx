"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { updateCurrentCampaignAction } from "@/app/leadgen/agent/(dashboard)/actions";

type CampaignOption = {
  id: string;
  name: string;
};

function SaveStatus() {
  const { pending } = useFormStatus();
  return (
    <span aria-live="polite" className="text-[12px] font-medium text-slate-500">
      {pending ? "Saving…" : "Saved automatically"}
    </span>
  );
}

export default function AgentCampaignSelector({ campaigns, currentCampaignId }: { campaigns: CampaignOption[]; currentCampaignId: string | null }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 sm:flex sm:items-end sm:justify-between sm:gap-5">
      <div className="min-w-0 flex-1">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Current Campaign</h2>
        <p className="mt-1 text-[13px] text-slate-600">Select the campaign you are working on now.</p>
      </div>
      <form ref={formRef} action={updateCurrentCampaignAction} className="mt-3 flex min-w-0 flex-col gap-1.5 sm:mt-0 sm:w-80">
        <label htmlFor="current-campaign" className="text-[12px] font-semibold text-slate-700">
          Select Campaign / Current Campaign
        </label>
        <select
          id="current-campaign"
          name="campaignId"
          defaultValue={currentCampaignId ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
          className="w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-[13.5px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        >
          <option value="">Not selected</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
        <SaveStatus />
      </form>
    </section>
  );
}

