import type { LeadgenAgentCampaignScriptKey } from "@/lib/leadgen-agent-campaigns";
import { BrentsEssentialsCallScript, MantraCollabCallScript } from "./leadgen-call-scripts";

// Renders directly below the "Current Client" selector on the agent
// dashboard. Driven entirely by the saved campaign's script key (resolved
// server-side from the campaign's client relationship / campaign id in
// src/lib/leadgen-agent-campaigns.ts) - never by matching campaign or
// client name text - so it can't drift out of sync with what was actually
// saved. Both scripts themselves live in leadgen-call-scripts.tsx, the
// same source the Training section renders, so this section and Training
// always show identical wording.
export default function CampaignCallScriptSection({
  scriptKey,
  agentFullName,
}: {
  scriptKey: LeadgenAgentCampaignScriptKey | null;
  agentFullName: string;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4 sm:p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-sky-700">Current Client Call Script</h2>

      {scriptKey === null && (
        <p className="mt-2 text-[13.5px] text-slate-600">Select a client to view its call script.</p>
      )}

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
    </section>
  );
}
