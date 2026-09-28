import Link from "next/link";
import ClientCallScriptPanel from "./ClientCallScriptPanel";
import { buildLeadgenCallScript } from "@/lib/leadgen-call-script";
import type { LeadgenClientRow, LeadgenCampaignRow } from "@/lib/leadgen-types";

type TrainingClient = Pick<LeadgenClientRow, "id" | "name" | "active" | "call_script_value_proposition" | "call_script_services" | "call_script_closing" | "call_script_notes" | "call_script_override">;
type TrainingCampaign = Pick<LeadgenCampaignRow, "id" | "client_id" | "status" | "territory" | "description" | "service_type" | "qualification_criteria">;

export function WebsiteServicesCampaignTraining() {
  return (
    <section id="website-services" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
      <h2 className="text-xl font-bold text-slate-900">Website Services Campaign Training</h2>
      <p className="mt-2 text-sm text-slate-600">Use this shared approach for the website-services campaigns below. Keep the opening short and conversational.</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Confirm the prospect&apos;s business name first. Introduce yourself: &ldquo;My name is [Agent Name] calling from Winsalot Corp on behalf of [Client Business Name].&rdquo;</li>
        <li>Briefly explain the applicable services: a new website, redesign or rebrand, stronger online visibility, and lead generation through SEO where offered.</li>
        <li>Ask whether the prospect has no website, has an outdated or weak website, wants better visibility, or wants more inquiries from their website.</li>
        <li>Qualify the right business or industry, a decision maker or appropriate contact, genuine interest in the client&apos;s offered website, SEO, e-commerce, hosting or maintenance services, and willingness to meet the client.</li>
        <li>Book qualified prospects through the existing appointment workflow. Do not promise results, guaranteed sales, or conversions.</li>
      </ol>
      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-900">Short objection responses</summary>
        <dl className="mt-3 space-y-3">
          <div><dt className="font-semibold">&ldquo;We already have a website.&rdquo;</dt><dd>Are you satisfied with how it looks, performs, generates inquiries, and ranks online?</dd></div>
          <div><dt className="font-semibold">&ldquo;We are not interested.&rdquo;</dt><dd>Understood. Thank you for your time. Have a good day.</dd></div>
          <div><dt className="font-semibold">&ldquo;Send me information.&rdquo;</dt><dd>Of course. What is the best email address? Then use the existing campaign email workflow.</dd></div>
          <div><dt className="font-semibold">&ldquo;How much does it cost?&rdquo;</dt><dd>Pricing depends on your business requirements. The client can discuss options during a consultation. Only quote pricing specifically approved in the client campaign.</dd></div>
        </dl>
      </details>
    </section>
  );
}

export function WebsiteClientTrainingCard({ client, campaign, agentName, admin }: { client: TrainingClient; campaign: TrainingCampaign; agentName: string; admin: boolean }) {
  const script = buildLeadgenCallScript({ client, agentName });
  return (
    <section id={`website-client-${client.id}`} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">{client.name}</h2>
        {admin && campaign.status !== "active" && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Campaign {campaign.status} — preparation</span>}
      </div>
      <p className="mt-2 text-sm text-slate-700"><strong>Client services:</strong> {client.call_script_services?.trim() || campaign.service_type || campaign.description || "See the client campaign for approved services."}</p>
      <p className="mt-1 text-sm text-slate-700"><strong>Target geography:</strong> {campaign.territory?.trim() || "See the client campaign for the approved territory."}</p>
      <p className="mt-1 text-sm text-slate-700"><strong>Appointment Target:</strong> 8–12 appointments per campaign. This is a campaign goal, not guaranteed conversions or sales.</p>
      <p className="mt-3 text-sm font-semibold text-slate-900">Approved customized call script</p>
      <div className="mt-2"><ClientCallScriptPanel script={script} compact /></div>
      <p className="mt-3 text-sm text-slate-700"><strong>Qualified lead:</strong> {campaign.qualification_criteria?.length ? campaign.qualification_criteria.join("; ") : "A relevant business and decision maker or appropriate contact, genuine interest in the client’s services, and willingness to meet the client."}</p>
      <p className="mt-2 text-sm text-slate-700"><strong>Client-specific notes:</strong> {script.notes || campaign.description || "Review the client campaign before calling; use only approved services and pricing."}</p>
      {admin && <Link href={`/leadgen/admin/clients/${client.id}`} className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:text-sky-800">Open client record</Link>}
    </section>
  );
}

export type { TrainingClient, TrainingCampaign };
