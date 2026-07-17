import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { QuoteRequestRow } from "@/lib/admin-types";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  provider_quote_received: "Provider Quote Received",
  quote_approved: "Quote Approved",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-amber-100 text-amber-800",
  provider_quote_received: "bg-sky-100 text-sky-800",
  quote_approved: "bg-emerald-100 text-emerald-800",
};

export default async function AdminDashboardPage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("quote_requests")
    .select(
      "id, created_at, full_name, city, cleaning_type, property_type, status"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const requests = (data ?? []) as Pick<
    QuoteRequestRow,
    "id" | "created_at" | "full_name" | "city" | "cleaning_type" | "property_type" | "status"
  >[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Quote Requests</h1>
      <p className="mt-1 text-sm text-slate-500">
        Requests submitted through the public quote form.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load requests: {error.message}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Cleaning Type</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">
                  {new Date(request.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/admin/requests/${request.id}`} className="hover:text-sky-600">
                    {request.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{request.city}</td>
                <td className="px-4 py-3 text-slate-600">{request.cleaning_type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLES[request.status] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {STATUS_LABELS[request.status] ?? request.status}
                  </span>
                </td>
              </tr>
            ))}

            {requests.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No quote requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
