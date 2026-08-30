import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenCampaignRow } from "@/lib/leadgen-types";

export default async function ClientPortalProfilePage() {
  const { user, client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const { data: campaigns } = await supabase
    .from("leadgen_campaigns")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const allCampaigns = (campaigns ?? []) as LeadgenCampaignRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
      <p className="mt-1 text-sm text-slate-500">Your account and campaign details.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Account</h2>
        <dl className="mt-3 space-y-2 text-[13.5px]">
          <div>
            <dt className="text-slate-500">Company</dt>
            <dd className="font-medium text-slate-900">{client.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Login Email</dt>
            <dd className="font-medium text-slate-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Contact Name</dt>
            <dd className="font-medium text-slate-900">{user.full_name}</dd>
          </div>
        </dl>
        <a href="/leadgen/forgot-password" className="mt-4 inline-block text-[13px] font-semibold text-indigo-600">
          Change password
        </a>
      </section>

      {allCampaigns.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Campaigns</h2>
          <ul className="mt-3 space-y-2">
            {allCampaigns.map((campaign) => (
              <li key={campaign.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-[13.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{campaign.name}</span>
                  <span className="text-[12px] text-slate-500">{campaign.status}</span>
                </div>
                {campaign.description && <p className="mt-1 text-slate-600">{campaign.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
