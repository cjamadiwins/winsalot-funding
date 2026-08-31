import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CrmUserRow } from "@/lib/crm-types";
import OpportunityFieldsForm from "@/components/OpportunityFieldsForm";
import { createOpportunityAction } from "./actions";

// Admin "Add Opportunity" - reuses the exact same field set and
// crm_opportunities table as the agent's "New Opportunity" workflow
// (OpportunityFieldsForm), with one addition appropriate to the admin
// role: an "Assigned Agent" picker, since an admin adding an opportunity
// isn't necessarily its own agent. Left unassigned by default - an admin
// can still assign it afterward from the opportunity's own page, exactly
// as they already do for any other unassigned prospect.
export default async function AdminNewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCrmAdmin();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: agents } = await supabase
    .from("crm_users")
    .select("id, full_name, email")
    .eq("role", "agent")
    .eq("active", true)
    .order("full_name");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Add Opportunity</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add a new Lead Generation or Business Financing prospect to the pipeline.
      </p>

      <form
        action={createOpportunityAction}
        className="mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6"
      >
        {params.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <OpportunityFieldsForm />

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Assigned Agent (optional)</span>
          <select
            name="assigned_agent_id"
            defaultValue=""
            className="w-full rounded-[10px] border border-slate-300 bg-white px-3.5 py-3 text-[15px]"
          >
            <option value="">Unassigned</option>
            {((agents ?? []) as Pick<CrmUserRow, "id" | "full_name" | "email">[]).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.full_name || agent.email}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-sky-600 px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-sky-700 sm:w-auto"
        >
          Save Opportunity
        </button>
      </form>
    </div>
  );
}
