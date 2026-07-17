import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ProviderQuoteSubmissionRow, ProviderQuoteTokenRow, ProviderRow, QuoteRequestRow } from "@/lib/admin-types";
import RequestWorkflowPanel from "./RequestWorkflowPanel";

const DETAIL_FIELDS: { label: string; key: keyof QuoteRequestRow }[] = [
  { label: "Full name", key: "full_name" },
  { label: "Phone", key: "phone" },
  { label: "Email", key: "email" },
  { label: "City", key: "city" },
  { label: "Service address", key: "service_address" },
  { label: "Property type", key: "property_type" },
  { label: "Cleaning type", key: "cleaning_type" },
  { label: "Bedrooms", key: "bedrooms" },
  { label: "Bathrooms", key: "bathrooms" },
  { label: "Approximate size", key: "property_size" },
  { label: "Preferred date", key: "preferred_date" },
  { label: "Frequency", key: "service_frequency" },
  { label: "Preferred contact method", key: "preferred_contact_method" },
];

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [{ data: request }, { data: providers }, { data: tokens }, { data: submissions }] =
    await Promise.all([
      supabase.from("quote_requests").select("*").eq("id", id).maybeSingle(),
      supabase.from("cleaning_providers").select("*").order("company_name"),
      supabase
        .from("provider_quote_tokens")
        .select("*")
        .eq("quote_request_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("provider_quote_submissions")
        .select("*")
        .eq("quote_request_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!request) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{request.full_name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Submitted {new Date(request.created_at).toLocaleString()}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Customer Request
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            {DETAIL_FIELDS.map(({ label, key }) => {
              const value = request[key];
              if (!value) return null;
              return (
                <div key={key} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-900">{String(value)}</dd>
                </div>
              );
            })}
          </dl>

          {request.description && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-slate-500">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-900">{request.description}</p>
            </div>
          )}
        </section>

        <RequestWorkflowPanel
          request={request as QuoteRequestRow}
          providers={(providers ?? []) as ProviderRow[]}
          tokens={(tokens ?? []) as ProviderQuoteTokenRow[]}
          submissions={(submissions ?? []) as ProviderQuoteSubmissionRow[]}
        />
      </div>
    </div>
  );
}
