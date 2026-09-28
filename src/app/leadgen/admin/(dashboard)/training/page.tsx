import Link from "next/link";
import BrentsEssentialsTrainingContent from "@/components/leadgen/BrentsEssentialsTrainingContent";
import MantraCollabTrainingContent from "@/components/leadgen/MantraCollabTrainingContent";
import CallLogTrainingContent from "@/components/leadgen/CallLogTrainingContent";
import ConnectProposeCloseCourse from "@/components/ConnectProposeCloseCourse";
import ColdCallingTrainingSection from "@/components/crm-training/ColdCallingTrainingSection";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { fetchOwnSharedTrainingCompletion, fetchSharedTrainingCompletionsForCrm } from "@/lib/shared-training-data";
import { COLD_CALLING_TRAINING_KEY, COLD_CALLING_TRAINING_VERSION } from "@/lib/shared-training-types";
import { loadWebsiteTraining, loadInactiveLegacyTraining } from "@/lib/leadgen-training-data";
import { WebsiteServicesCampaignTraining, WebsiteClientTrainingCard } from "@/components/leadgen/WebsiteCampaignTraining";

export default async function LeadgenAdminTrainingPage() {
  const admin = await requireLeadgenAdmin();
  const [coldCallingCompletion, coldCallingCompletions, websiteCampaigns, inactiveLegacy] = await Promise.all([
    fetchOwnSharedTrainingCompletion("leadgen", COLD_CALLING_TRAINING_KEY, COLD_CALLING_TRAINING_VERSION, admin.id),
    fetchSharedTrainingCompletionsForCrm("leadgen", COLD_CALLING_TRAINING_KEY, COLD_CALLING_TRAINING_VERSION),
    loadWebsiteTraining(true),
    loadInactiveLegacyTraining(),
  ]);
  const activeCampaigns = websiteCampaigns.filter(({ campaign }) => campaign.status === "active");
  const preparationCampaigns = websiteCampaigns.filter(({ campaign }) => campaign.status === "paused");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900">Campaign Training</h1>
        <p className="mt-2 text-sm text-slate-600">Choose the client training you want to open.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="#call-logs" className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Open Call Log Training</Link>
          {websiteCampaigns.length > 0 && <Link href="#website-services" className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">Website Services Campaign Training</Link>}
          {activeCampaigns.map(({ client }) => <Link key={client.id} href={`#website-client-${client.id}`} className="rounded-lg border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">{client.name}</Link>)}
        </div>
      </section>
      <ColdCallingTrainingSection
        crm="leadgen"
        role="admin"
        initialCompletion={coldCallingCompletion}
        allCompletions={coldCallingCompletions}
      />
      <ConnectProposeCloseCourse crm="leadgen" />
      <CallLogTrainingContent />
      {websiteCampaigns.length > 0 && <WebsiteServicesCampaignTraining />}
      {activeCampaigns.map(({ client, campaign }) => <WebsiteClientTrainingCard key={client.id} client={client} campaign={campaign} agentName={admin.full_name || admin.email} admin />)}
      {preparationCampaigns.length > 0 && <section className="space-y-4"><h2 className="text-lg font-bold text-slate-900">Upcoming campaign preparation (Admin)</h2><p className="text-sm text-slate-600">Training and campaign materials are available to assigned agents before launch. Campaign production begins on September 29, 2026 after Admin activates the campaigns.</p>{preparationCampaigns.map(({ client, campaign }) => <WebsiteClientTrainingCard key={client.id} client={client} campaign={campaign} agentName={admin.full_name || admin.email} admin />)}</section>}
      {inactiveLegacy.size > 0 && <details className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <summary className="cursor-pointer font-semibold text-slate-900">Inactive client training archive (Admin)</summary>
        <p className="mt-2 text-sm text-slate-600">Historical training is retained with the inactive client records.</p>
        <div className="mt-4 space-y-6">
          {inactiveLegacy.has("Mantra Collab") && <div><Link href={`/leadgen/admin/clients/${inactiveLegacy.get("Mantra Collab")}`} className="text-sm font-semibold text-sky-700">Open Mantra Collab history</Link><MantraCollabTrainingContent /></div>}
          {inactiveLegacy.has("Brent's Essentials") && <div><Link href={`/leadgen/admin/clients/${inactiveLegacy.get("Brent's Essentials")}`} className="text-sm font-semibold text-sky-700">Open Brent&apos;s Essentials history</Link><BrentsEssentialsTrainingContent dashboardHref="/leadgen/admin" /></div>}
        </div>
      </details>}
    </div>
  );
}
