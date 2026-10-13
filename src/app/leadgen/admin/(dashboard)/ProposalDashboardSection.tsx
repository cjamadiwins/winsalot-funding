import Link from "next/link";
import { CheckCircle2, ClipboardList, FileText, Hammer, Send, XCircle } from "lucide-react";
import KpiCard from "@/components/crm-ui/KpiCard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { OPEN_PROPOSAL_STATUSES, PROPOSAL_STATUS_STYLES, proposalStatusLabel, summarizeProposals, type LeadProposalRow, type ProposalDraftRow } from "@/lib/leadgen-proposal";

// Admin dashboard "Proposals" section: how many proposal requests are at each
// stage, and the open ones with a link to the lead. Read-only - statuses are
// changed on the lead page. If the leadgen_lead_proposals table isn't there yet
// the query returns nothing and the section simply shows no requests.
export default async function ProposalDashboardSection() {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("leadgen_lead_proposals").select("*").neq("status", "not_requested").order("last_requested_at", { ascending: false, nullsFirst: false }).limit(500);
  const rows = (data ?? []) as LeadProposalRow[];
  // Agent-prepared requests waiting for Admin to approve and send.
  const { data: draftData } = await admin.from("leadgen_proposal_drafts").select("*").order("prepared_at", { ascending: false }).limit(200);
  const drafts = (draftData ?? []) as ProposalDraftRow[];
  const counts = summarizeProposals(rows);
  const open = rows.filter((row) => OPEN_PROPOSAL_STATUSES.includes(row.status)).slice(0, 8);

  const shownDrafts = drafts.slice(0, 8);
  const leadIds = [...new Set([...open.map((row) => row.lead_id), ...shownDrafts.map((d) => d.lead_id)])];
  const clientIds = [...new Set([...open.map((row) => row.client_id), ...shownDrafts.map((d) => d.client_id)])];
  const [{ data: leads }, { data: clients }] = await Promise.all([
    leadIds.length ? admin.from("leadgen_leads").select("id, business_name").in("id", leadIds) : Promise.resolve({ data: [] }),
    clientIds.length ? admin.from("leadgen_clients").select("id, name").in("id", clientIds) : Promise.resolve({ data: [] }),
  ]);
  const leadName = new Map((leads ?? []).map((l) => [l.id as string, l.business_name as string]));
  const clientName = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5" aria-label="Proposals">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-purple-700">Proposals</h2>
      {drafts.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <p className="font-semibold">
            {drafts.length} prepared {drafts.length === 1 ? "request is" : "requests are"} awaiting your approval
          </p>
          <ul className="mt-1.5 space-y-1">
            {shownDrafts.map((d) => (
              <li key={d.id}>
                <Link href={`/leadgen/admin/leads/${d.lead_id}`} className="font-semibold text-sky-700 hover:underline">
                  {leadName.get(d.lead_id) ?? "Lead"}
                </Link>
                <span className="text-amber-800"> · {clientName.get(d.client_id) ?? "Client"} · prepared {new Date(d.prepared_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Proposal Requested" value={counts.proposal_requested} icon={<ClipboardList />} tone="blue" />
        <KpiCard label="In Preparation" value={counts.in_preparation} icon={<Hammer />} tone="amber" />
        <KpiCard label="Proposal Sent" value={counts.proposal_sent} icon={<Send />} tone="indigo" />
        <KpiCard label="Accepted" value={counts.accepted} icon={<CheckCircle2 />} tone="green" />
        <KpiCard label="Declined" value={counts.declined} icon={<XCircle />} tone="red" />
      </div>

      {open.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <FileText className="h-4 w-4" aria-hidden="true" /> No open proposal requests.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {open.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/leadgen/admin/leads/${row.lead_id}`} className="font-semibold text-sky-700 hover:underline">
                {leadName.get(row.lead_id) ?? "Lead"}
              </Link>
              <span className="text-slate-500">
                {clientName.get(row.client_id) ?? "Client"}
                {row.last_requested_at ? ` · requested ${new Date(row.last_requested_at).toLocaleDateString()}` : ""}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PROPOSAL_STATUS_STYLES[row.status]}`}>{proposalStatusLabel(row.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
