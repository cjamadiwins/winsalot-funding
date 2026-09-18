import {
  GROWTH_CRM_CAMPAIGN_LABELS,
  GROWTH_CRM_CAMPAIGN_SCRIPTS,
  GROWTH_CRM_CAMPAIGN_TONE,
  type GrowthCrmCampaignKey,
} from "@/lib/growth-crm-campaign-scripts";

// The colored script box itself - shared by the agent dashboard's
// persisted selector (AgentCampaignScriptCard) and the admin dashboard's
// local preview selector (AdminCampaignScriptCard), so the two can never
// render a campaign's script differently from one another.
export default function CampaignQuickScriptCard({
  campaignKey,
  agentName,
}: {
  campaignKey: GrowthCrmCampaignKey | null;
  agentName: string;
}) {
  if (!campaignKey) {
    return <p className="mt-3 text-[13.5px] text-slate-600">Select a campaign to view its call script.</p>;
  }

  const tone = GROWTH_CRM_CAMPAIGN_TONE[campaignKey];
  const script = GROWTH_CRM_CAMPAIGN_SCRIPTS[campaignKey];

  return (
    <div className={`mt-3 rounded-xl border ${tone.border} ${tone.bg} p-4 sm:p-5`}>
      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.badge}`}>
        {GROWTH_CRM_CAMPAIGN_LABELS[campaignKey]}
      </span>

      <p className="mt-3 text-[13.5px] leading-6 text-slate-700">{script.opener(agentName)}</p>

      {script.followUp && (
        <>
          <p className={`mt-3 text-[11px] font-semibold uppercase tracking-wide ${tone.heading}`}>
            {script.followUpLabel ?? "Follow-Up"}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-6 text-slate-700">{script.followUp(agentName)}</p>
        </>
      )}

      {script.guidance && script.guidance.length > 0 && (
        <div className="mt-4 border-t border-white/60 pt-3">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone.heading}`}>Important</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] text-slate-600">
            {script.guidance.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
