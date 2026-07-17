import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ProviderRow } from "@/lib/admin-types";
import { createProviderAction, setProviderStatusAction } from "./actions";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export default async function AdminProvidersPage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("cleaning_providers")
    .select("*")
    .order("company_name");

  const providers = (data ?? []) as ProviderRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Cleaning Providers</h1>
      <p className="mt-1 text-sm text-slate-500">
        Companies you can assign quote requests to.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add a Provider
        </h2>
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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone / Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/admin/providers/${provider.id}`} className="hover:text-sky-600">
                    {provider.company_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{provider.contact_person ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {[provider.phone, provider.email].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      provider.status === "active"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {provider.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form
                    action={setProviderStatusAction.bind(
                      null,
                      provider.id,
                      provider.status === "active" ? "inactive" : "active"
                    )}
                  >
                    <button type="submit" className="text-xs font-medium text-sky-600 hover:text-sky-700">
                      {provider.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}

            {providers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No providers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
