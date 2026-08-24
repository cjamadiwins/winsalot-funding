import type { ReactNode } from "react";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isHiddenLeadgenCampaignName } from "@/lib/leadgen-types";
import { createAgentLeadAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default async function LeadgenAgentNewLeadPage({
  searchParams,
}: {
  // `client` is set by the agent leads page's "+ Add Lead" link when
  // scoped to one client (via ?client=<id>) - just pre-selects the
  // Client field below, the agent can still change it.
  searchParams: Promise<{ error?: string; client?: string }>;
}) {
  await requireLeadgenAgent();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: clients }, { data: campaigns }] = await Promise.all([
    supabase.from("leadgen_clients").select("*").eq("active", true).order("name"),
    supabase.from("leadgen_campaigns").select("*").eq("status", "active").order("name"),
  ]);
  const preselectedClientId = params.client && (clients ?? []).some((c) => c.id === params.client) ? params.client : "";

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Add Lead</h1>
      <p className="mt-1 text-sm text-slate-500">Create a new lead and assign it to yourself.</p>

      <form action={createAgentLeadAction} className="mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        {params.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.error}</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business Name" required>
            <input name="business_name" required className={inputClass} />
          </Field>
          <Field label="Client" required>
            <select name="client_id" required className={inputClass} defaultValue={preselectedClientId}>
              <option value="" disabled>
                Select a client…
              </option>
              {(clients ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campaign">
            <select name="campaign_id" className={inputClass} defaultValue="">
              <option value="">No campaign</option>
              {(campaigns ?? []).filter((campaign) => !isHiddenLeadgenCampaignName(campaign.name)).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry">
            <input name="industry" className={inputClass} />
          </Field>
          <Field label="Contact Name">
            <input name="contact_name" className={inputClass} />
          </Field>
          <Field label="Decision Maker Name">
            <input name="decision_maker_name" className={inputClass} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label="Website">
            <input name="website" type="url" className={inputClass} />
          </Field>
          <Field label="City">
            <input name="city" className={inputClass} />
          </Field>
          <Field label="Province">
            <input name="province" className={inputClass} />
          </Field>
          <Field label="Lead Source">
            <input name="lead_source" className={inputClass} />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Notes">
            <textarea name="notes" className={`${inputClass} min-h-[110px] resize-y`} />
          </Field>
        </div>

        <button
          type="submit"
          className="mt-6 rounded-full bg-sky-600 px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700"
        >
          Save Lead
        </button>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate-600">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
