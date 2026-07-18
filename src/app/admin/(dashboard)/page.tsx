import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { QuoteRequestRow } from "@/lib/admin-types";
import RequestsTable from "./RequestsTable";

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

      {!error && (
        <div className="mt-6">
          <RequestsTable requests={requests} />
        </div>
      )}
    </div>
  );
}
