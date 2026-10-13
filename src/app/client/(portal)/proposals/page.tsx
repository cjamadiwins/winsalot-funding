import Link from "next/link";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CLIENT_PORTAL_PROPOSAL_LABELS, PROPOSAL_STATUS_STYLES, type LeadProposalRow } from "@/lib/leadgen-proposal";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// "Proposals": the proposal requests Winsalot has sent THIS client. Everything
// here is read through the signed-in session (RLS: leadgen_lead_proposals_client_
// select_own and leadgen_leads_client_select_own), so a client can only ever see
// its own prospects and requests. Only client-safe fields are selected - the
// prospect's business and contact name, the request date and the status; never
// agent notes, the activity timeline, the assigned agent or any internal field.
export default async function ClientPortalProposalsPage() {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const { data: proposals } = await supabase
    .from("leadgen_lead_proposals")
    .select("*")
    .eq("client_id", client.id)
    .neq("status", "not_requested")
    .order("last_requested_at", { ascending: false, nullsFirst: false });
  const rows = (proposals ?? []) as LeadProposalRow[];

  const leadIds = rows.map((row) => row.lead_id);
  const { data: leads } = leadIds.length
    ? await supabase.from("leadgen_leads").select("id, business_name, contact_name").eq("client_id", client.id).in("id", leadIds)
    : { data: [] };
  const leadById = new Map((leads ?? []).map((lead) => [lead.id as string, lead as { id: string; business_name: string; contact_name: string | null }]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Proposals</h1>
      <p className="mt-1 text-sm text-slate-500">Prospects Winsalot has asked you to prepare a proposal for, and where each one stands.</p>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-[13.5px] text-slate-500">No proposal requests yet.</p>
        ) : (
          rows.map((row) => {
            const lead = leadById.get(row.lead_id);
            return (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">
                    {lead ? (
                      <Link href={`/client/leads/${lead.id}`} className="hover:underline">
                        {lead.business_name}
                      </Link>
                    ) : (
                      "Prospect"
                    )}
                  </h3>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PROPOSAL_STATUS_STYLES[row.status]}`}>{CLIENT_PORTAL_PROPOSAL_LABELS[row.status]}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  {lead?.contact_name ? `Contact: ${lead.contact_name} · ` : ""}Requested {formatDate(row.first_requested_at ?? row.created_at)}
                  {row.request_count > 1 ? ` · latest request ${formatDate(row.last_requested_at)}` : ""}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
