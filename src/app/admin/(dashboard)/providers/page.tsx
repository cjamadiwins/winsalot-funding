import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminUser } from "@/lib/admin-auth";
import type { CleaningProviderRow } from "@/lib/provider-types";
import type { CrmUserRow } from "@/lib/crm-types";
import { createProviderAction } from "./actions";
import ProvidersListAdminClient from "./ProvidersListAdminClient";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export default async function AdminProvidersPage() {
  await requireAdminUser();
  const supabase = getSupabaseAdmin();
  const [{ data: providers }, { data: agents }] = await Promise.all([
    supabase.from("cleaning_providers").select("*").order("company_name"),
    supabase.from("crm_users").select("*").order("full_name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Providers</h1>
      <p className="mt-1 text-sm text-slate-500">
        The permanent operational Provider Profile for every cleaning provider - companies you can assign quote
        requests to. Providers approved from Provider Acquisition appear here automatically.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a Provider</h2>
        <form action={createProviderAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input name="companyName" placeholder="Company name" required className={inputClasses} />
          <input name="contactPerson" placeholder="Contact person" className={inputClasses} />
          <input name="email" type="email" placeholder="Email" className={inputClasses} />
          <input name="phone" placeholder="Phone" className={inputClasses} />
          <input
            name="serviceLocations"
            placeholder="Service locations"
            className={`${inputClasses} sm:col-span-2`}
          />
          <textarea
            name="pricingNotes"
            placeholder="Pricing notes"
            rows={2}
            className={`${inputClasses} sm:col-span-2`}
          />
          <textarea
            name="internalNotes"
            placeholder="Internal notes"
            rows={2}
            className={`${inputClasses} sm:col-span-2`}
          />
          <button
            type="submit"
            className="rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 sm:col-span-2 sm:w-fit"
          >
            Add Provider
          </button>
        </form>
      </section>

      <ProvidersListAdminClient
        providers={(providers ?? []) as CleaningProviderRow[]}
        agents={(agents ?? []) as CrmUserRow[]}
      />
    </div>
  );
}
