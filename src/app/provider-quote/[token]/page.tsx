import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashProviderToken } from "@/lib/tokens";
import { isTokenActive } from "@/lib/admin-types";
import ProviderQuoteForm from "@/components/provider-quote/ProviderQuoteForm";

// Fields a provider needs to price a job. Deliberately excludes the
// customer's name, phone and email — Winsalot Corp is the only party that
// contacts the customer directly.
type ScopedRequest = {
  city: string;
  service_address: string | null;
  property_type: string;
  cleaning_type: string;
  bedrooms: string | null;
  bathrooms: string | null;
  property_size: string | null;
  preferred_date: string | null;
  service_frequency: string | null;
  description: string;
};

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">This link is no longer valid</h1>
        <p className="mt-3 text-sm text-slate-600">
          It may have expired or been revoked. Please contact Winsalot Corp for a new link.
        </p>
      </div>
    </div>
  );
}

export default async function ProviderQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();
  const tokenHash = hashProviderToken(token);

  const { data: tokenRow } = await supabase
    .from("provider_quote_tokens")
    .select("id, quote_request_id, provider_id, expires_at, revoked_at, viewed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !isTokenActive(tokenRow)) {
    return <InvalidLink />;
  }

  if (!tokenRow.viewed_at) {
    await supabase
      .from("provider_quote_tokens")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", tokenRow.id);
  }

  const [{ data: request }, { data: provider }, { data: existingSubmission }] = await Promise.all([
    supabase
      .from("quote_requests")
      .select(
        "city, service_address, property_type, cleaning_type, bedrooms, bathrooms, property_size, preferred_date, service_frequency, description"
      )
      .eq("id", tokenRow.quote_request_id)
      .maybeSingle(),
    supabase
      .from("cleaning_providers")
      .select("company_name")
      .eq("id", tokenRow.provider_id)
      .maybeSingle(),
    supabase
      .from("provider_quote_submissions")
      .select("id")
      .eq("token_id", tokenRow.id)
      .maybeSingle(),
  ]);

  if (!request) {
    return <InvalidLink />;
  }

  const details = request as ScopedRequest;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium text-slate-500">Quote request for {provider?.company_name}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Prepare Your Quote</h1>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Job Details
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ["City", details.city],
              ["Service address", details.service_address],
              ["Property type", details.property_type],
              ["Cleaning type", details.cleaning_type],
              ["Bedrooms", details.bedrooms],
              ["Bathrooms", details.bathrooms],
              ["Approximate size", details.property_size],
              ["Preferred date", details.preferred_date],
              ["Frequency", details.service_frequency],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-900">{value}</dd>
                </div>
              ))}
          </dl>
          {details.description && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-slate-500">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-900">{details.description}</p>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          {existingSubmission ? (
            <p className="text-sm text-slate-600">
              You&apos;ve already submitted a quote for this request. Thank you.
            </p>
          ) : (
            <ProviderQuoteForm token={token} />
          )}
        </section>
      </div>
    </div>
  );
}
