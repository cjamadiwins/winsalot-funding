import { requireLeadgenClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_EMAIL_STATUS_STYLES, type LeadgenEmailRow } from "@/lib/leadgen-types";

export default async function LeadgenClientCommunicationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { client } = await requireLeadgenClient(slug);
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_emails_client_select_own) already excludes drafts and
  // anything not explicitly marked client_visible - this client login
  // can never see an internal-only or prospect-facing email regardless
  // of what filters this query does or doesn't apply.
  const { data: emails } = await supabase
    .from("leadgen_emails")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const rows = (emails ?? []) as LeadgenEmailRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Communications</h1>
      <p className="mt-1 text-sm text-slate-500">Every message we&apos;ve sent to you about your campaign.</p>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-[13.5px] text-slate-500">
            No messages yet.
          </p>
        ) : (
          rows.map((email) => (
            <div key={email.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{email.subject}</h3>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[email.status]}`}>{email.status}</span>
              </div>
              <p className="mt-1 text-[12px] text-slate-500">{new Date(email.created_at).toLocaleString()}</p>
              <p className="mt-3 whitespace-pre-wrap text-[13.5px] text-slate-700">{email.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
