import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashProviderToken } from "@/lib/tokens";
import { isTokenActive, PRICE_TYPE_LABELS, type PriceType } from "@/lib/admin-types";
import CustomerQuoteResponseForm from "@/components/customer-quote/CustomerQuoteResponseForm";

// Fields the customer needs to review their own approved quote. Deliberately
// excludes anything provider-internal (pricing_notes, internal_notes, the
// raw provider_quote_submissions row) — only what Winsalot Corp has
// reviewed and approved is ever shown here.
type ScopedRequest = {
  full_name: string;
  city: string;
  cleaning_type: string;
  property_type: string;
  customer_quote_price: number | null;
  customer_quote_price_type: string | null;
  customer_quote_provider_name: string | null;
  customer_quote_notes: string | null;
  customer_response: "accepted" | "declined" | null;
  customer_response_at: string | null;
};

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Winsalot Corp
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          This quote is no longer available
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          The link may have expired or already been used. Please contact Winsalot Corp if you
          have questions about your quote.
        </p>
      </div>
    </div>
  );
}

function AlreadyResponded({ response, respondedAt }: { response: "accepted" | "declined"; respondedAt: string | null }) {
  const accepted = response === "accepted";
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div
        className={`max-w-md rounded-2xl border p-8 text-center shadow-sm ${
          accepted ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
        }`}
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Winsalot Corp
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          {accepted ? "You already accepted this quote" : "You already declined this quote"}
        </h1>
        {respondedAt && (
          <p className="mt-3 text-sm text-slate-600">
            Response recorded on {new Date(respondedAt).toLocaleDateString()}.
          </p>
        )}
      </div>
    </div>
  );
}

export default async function CustomerQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { token } = await params;
  const { action } = await searchParams;
  const supabase = getSupabaseAdmin();
  const tokenHash = hashProviderToken(token);

  const { data: tokenRow } = await supabase
    .from("customer_quote_tokens")
    .select("id, quote_request_id, expires_at, revoked_at, viewed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !isTokenActive(tokenRow)) {
    return <InvalidLink />;
  }

  if (!tokenRow.viewed_at) {
    await supabase
      .from("customer_quote_tokens")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", tokenRow.id);
  }

  const { data: request } = await supabase
    .from("quote_requests")
    .select(
      "full_name, city, cleaning_type, property_type, customer_quote_price, customer_quote_price_type, customer_quote_provider_name, customer_quote_notes, customer_response, customer_response_at"
    )
    .eq("id", tokenRow.quote_request_id)
    .maybeSingle();

  if (!request) {
    return <InvalidLink />;
  }

  const details = request as ScopedRequest;

  if (details.customer_quote_price == null || !details.customer_quote_price_type) {
    return <InvalidLink />;
  }

  if (details.customer_response) {
    return (
      <AlreadyResponded
        response={details.customer_response}
        respondedAt={details.customer_response_at}
      />
    );
  }

  const priceTypeLabel =
    PRICE_TYPE_LABELS[details.customer_quote_price_type as PriceType] ??
    details.customer_quote_price_type;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Winsalot Corp
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Your Cleaning Quote</h1>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">Hi {details.full_name},</p>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Service</dt>
              <dd className="text-right font-medium text-slate-900">
                {details.cleaning_type} ({details.property_type})
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Location</dt>
              <dd className="text-right font-medium text-slate-900">{details.city}</dd>
            </div>
            {details.customer_quote_provider_name && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Provider</dt>
                <dd className="text-right font-medium text-slate-900">
                  {details.customer_quote_provider_name}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-slate-100 pt-2">
              <dt className="text-slate-500">Price</dt>
              <dd className="text-right text-base font-bold text-sky-700">
                ${details.customer_quote_price.toFixed(2)}{" "}
                <span className="text-sm font-medium text-slate-500">({priceTypeLabel})</span>
              </dd>
            </div>
          </dl>

          {details.customer_quote_notes && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-slate-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-900">
                {details.customer_quote_notes}
              </p>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <CustomerQuoteResponseForm token={token} defaultAction={action === "decline" ? "decline" : null} />
        </section>
      </div>
    </div>
  );
}
