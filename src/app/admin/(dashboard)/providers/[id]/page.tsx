import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ProviderRow } from "@/lib/admin-types";
import { updateProviderAction, setProviderStatusAction } from "../actions";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const labelClasses = "text-sm font-medium text-slate-800";

export default async function AdminProviderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("cleaning_providers").select("*").eq("id", id).maybeSingle();

  if (!data) {
    notFound();
  }

  const provider = data as ProviderRow;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{provider.company_name}</h1>
        <form
          action={setProviderStatusAction.bind(
            null,
            provider.id,
            provider.status === "active" ? "inactive" : "active"
          )}
        >
          <button
            type="submit"
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            {provider.status === "active" ? "Deactivate" : "Activate"}
          </button>
        </form>
      </div>

      <form
        action={updateProviderAction.bind(null, provider.id)}
        className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <div>
          <label htmlFor="companyName" className={labelClasses}>
            Company name
          </label>
          <input
            id="companyName"
            name="companyName"
            required
            defaultValue={provider.company_name}
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contactPerson" className={labelClasses}>
              Contact person
            </label>
            <input
              id="contactPerson"
              name="contactPerson"
              defaultValue={provider.contact_person ?? ""}
              className={`${inputClasses} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClasses}>
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              defaultValue={provider.phone ?? ""}
              className={`${inputClasses} mt-1.5`}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="email" className={labelClasses}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={provider.email ?? ""}
              className={`${inputClasses} mt-1.5`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="serviceLocations" className={labelClasses}>
            Service locations
          </label>
          <input
            id="serviceLocations"
            name="serviceLocations"
            defaultValue={provider.service_locations ?? ""}
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor="pricingNotes" className={labelClasses}>
            Pricing notes
          </label>
          <textarea
            id="pricingNotes"
            name="pricingNotes"
            rows={3}
            defaultValue={provider.pricing_notes ?? ""}
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor="internalNotes" className={labelClasses}>
            Internal notes
          </label>
          <textarea
            id="internalNotes"
            name="internalNotes"
            rows={3}
            defaultValue={provider.internal_notes ?? ""}
            className={`${inputClasses} mt-1.5`}
          />
        </div>

        <button
          type="submit"
          className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}
