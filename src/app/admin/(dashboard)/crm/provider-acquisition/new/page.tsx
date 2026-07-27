import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import NewProviderLeadForm from "./NewProviderLeadForm";

export default async function AdminNewProviderLeadPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: agents } = await supabase.from("crm_users").select("*").order("full_name");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Add Provider Lead</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter the cleaning company&apos;s information and optionally assign it to an agent.
      </p>

      <NewProviderLeadForm agents={(agents ?? []) as CrmUserRow[]} />
    </div>
  );
}
