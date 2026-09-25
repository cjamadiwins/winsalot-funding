import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { type CrmClientAgreementRow } from "@/lib/crm-agreement-types";
import NewAgreementForm from "./NewAgreementForm";
import AgreementsTableClient from "./AgreementsTableClient";

export default async function AdminCrmAgreementsPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agreements }, { data: opportunities }, { data: clients }] = await Promise.all([
    supabase.from("crm_client_agreements").select("*").order("created_at", { ascending: false }),
    supabase
      .from("crm_opportunities")
      .select("id, business_name, contact_name, email, stage")
      .eq("is_internal_test", false)
      .order("stage", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("crm_clients").select("id, company_name, primary_contact_name, email").order("company_name", { ascending: true }),
  ]);

  const agreementRows = (agreements ?? []) as CrmClientAgreementRow[];
  const agreementedOpportunityIds = new Set(agreementRows.map((a) => a.opportunity_id).filter(Boolean));
  const availableOpportunities = (opportunities ?? []).filter((o) => !agreementedOpportunityIds.has(o.id));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Client Agreements</h1>
      <p className="mt-1 text-sm text-slate-500">Create and manage client service agreements. Not visible to agents.</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-base font-bold text-slate-900">Start Onboarding</h2>
        <NewAgreementForm
          opportunities={availableOpportunities.map((o) => ({ id: o.id, label: `${o.business_name} (${o.email ?? "no email"}) — ${o.stage}` }))}
          clients={(clients ?? []).map((c) => ({ id: c.id, label: `${c.company_name} (${c.email ?? "no email"})` }))}
        />
      </div>

      <div className="mt-8">
        <AgreementsTableClient agreements={agreementRows} />
      </div>
    </div>
  );
}
