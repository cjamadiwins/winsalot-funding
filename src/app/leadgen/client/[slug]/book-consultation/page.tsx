import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenClientRow } from "@/lib/leadgen-types";
import BookConsultationClient from "./BookConsultationClient";

// Public, unauthenticated booking page - linked from the consultation
// invitation/follow-up emails. Deliberately outside the
// client/[slug]/(dashboard) route group (which is auth-gated by its own
// layout.tsx) and exempted from src/proxy.ts's session gate by pattern
// match, exactly like the cleaning CRM's /customer-quote/[token] and
// /provider-quote/[token] public pages. Reads through the service-role
// client (getSupabaseAdmin()) for the same reason those pages do: there
// is no Supabase Auth session here at all, and leadgen_clients has no
// anonymous-role RLS policy.
export default async function BookConsultationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = getSupabaseAdmin();

  const { data: client } = await admin.from("leadgen_clients").select("*").eq("slug", slug).maybeSingle();

  if (!client || !(client as LeadgenClientRow).active) {
    return <Unavailable />;
  }

  // Everything already booked (any status) in roughly the window the
  // slot picker offers - used to grey out taken slots. A slightly wider
  // window than the picker's own 14 days costs nothing and avoids an
  // off-by-one at the edge.
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + 21 * 24 * 60 * 60 * 1000);
  const { data: existing } = await admin
    .from("leadgen_appointments")
    .select("appointment_date, appointment_time, status")
    .eq("client_id", client.id)
    .gte("appointment_date", windowStart.toISOString().slice(0, 10))
    .lte("appointment_date", windowEnd.toISOString().slice(0, 10));

  return (
    <BookConsultationClient
      clientName={(client as LeadgenClientRow).name}
      clientSlug={slug}
      bookedSlots={(existing ?? []).map((a) => ({ date: a.appointment_date, time: a.appointment_time, status: a.status }))}
    />
  );
}

function Unavailable() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Winsalot Corp</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">This booking page isn&rsquo;t available</h1>
        <p className="mt-3 text-sm text-slate-600">
          The link may be incorrect, or this consultation offer is no longer active. Please contact us directly if you have questions.
        </p>
      </div>
    </div>
  );
}
