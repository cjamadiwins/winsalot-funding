import Link from "next/link";
import CallLogTrainingContent from "@/components/leadgen/CallLogTrainingContent";
import ConnectProposeCloseCourse from "@/components/ConnectProposeCloseCourse";
import ColdCallingTrainingSection from "@/components/crm-training/ColdCallingTrainingSection";
import { requireLeadgenUser } from "@/lib/leadgen-auth";
import { fetchOwnSharedTrainingCompletion } from "@/lib/shared-training-data";
import { COLD_CALLING_TRAINING_KEY, COLD_CALLING_TRAINING_VERSION } from "@/lib/shared-training-types";
import { loadWebsiteTraining } from "@/lib/leadgen-training-data";
import { WebsiteServicesCampaignTraining, WebsiteClientTrainingCard } from "@/components/leadgen/WebsiteCampaignTraining";

export default async function LeadgenAgentTrainingPage() {
  const user = await requireLeadgenUser();
  const [coldCallingCompletion, websiteCampaigns] = await Promise.all([
    fetchOwnSharedTrainingCompletion("leadgen", COLD_CALLING_TRAINING_KEY, COLD_CALLING_TRAINING_VERSION, user.id),
    loadWebsiteTraining(false, user.id),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900">Campaign Training</h1>
        <p className="mt-2 text-sm text-slate-600">Choose the client training you want to open.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="#call-logs" className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Open Call Log Training</Link>
          {websiteCampaigns.length > 0 && <Link href="#website-services" className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">Website Services Campaign Training</Link>}
          {websiteCampaigns.map(({ client }) => <Link key={client.id} href={`#website-client-${client.id}`} className="rounded-lg border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">{client.name}</Link>)}
        </div>
      </section>
      <ColdCallingTrainingSection crm="leadgen" role="agent" initialCompletion={coldCallingCompletion} />
      <ConnectProposeCloseCourse crm="leadgen" />
      <CallLogTrainingContent />
      {websiteCampaigns.length > 0 ? <WebsiteServicesCampaignTraining /> : <p className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 text-sm text-slate-600">No active website-services campaign is currently assigned or available for calling.</p>}
      {websiteCampaigns.map(({ client, campaign }) => <WebsiteClientTrainingCard key={client.id} client={client} campaign={campaign} agentName={user.full_name || user.email} admin={false} />)}
    </div>
  );
}
