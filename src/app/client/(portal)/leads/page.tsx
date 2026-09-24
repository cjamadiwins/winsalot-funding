import Link from "next/link";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_LEAD_STATUS_STYLES, type LeadgenLeadRow } from "@/lib/leadgen-types";
import { needsFollowUpLeadgenLead } from "@/lib/client-portal-dashboard";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type LeadFilter = "contacted" | "interested" | "follow-up";

const LEAD_FILTER_TABS: { key: LeadFilter | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "follow-up", label: "Follow-Ups" },
];

function matchesLeadFilter(lead: LeadgenLeadRow, filter: LeadFilter | undefined): boolean {
  if (!filter) return true;
  if (filter === "contacted") return Boolean(lead.last_contacted_at);
  if (filter === "interested") return lead.status === "Interested";
  return needsFollowUpLeadgenLead(lead);
}

// "My Leads" (brief) - only ever this client's own leads (RLS:
// leadgen_leads_client_select_own). Deliberately omits every
// internal-only field (agent notes, activity timeline, assigned agent,
// lead source, industry) - only what the brief lists as client-safe.
export default async function ClientPortalLeadsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();
  const { filter: rawFilter } = await searchParams;
  const filter = (["contacted", "interested", "follow-up"] as const).includes(rawFilter as LeadFilter) ? (rawFilter as LeadFilter) : undefined;

  const { data: leads } = await supabase
    .from("leadgen_leads")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const allRows = (leads ?? []) as LeadgenLeadRow[];
  const rows = allRows.filter((lead) => matchesLeadFilter(lead, filter));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Leads</h1>
      <p className="mt-1 text-sm text-slate-500">Every lead generated for your campaign.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {LEAD_FILTER_TABS.map((tab) => {
          const active = tab.key === "all" ? !filter : filter === tab.key;
          const href = tab.key === "all" ? "/client/leads" : `/client/leads?filter=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                active
                  ? "border-[var(--crm-accent,#3e7ef7)] bg-[var(--crm-accent,#3e7ef7)] text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">{filter ? "No leads match this filter." : "No leads yet."}</p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Business Name</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date Added</th>
                <th className="p-3">Last Contacted</th>
                <th className="p-3">Next Follow-Up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-900">
                    <Link href={`/client/leads/${lead.id}`} className="hover:underline">
                      {lead.business_name}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-600">
                    {lead.contact_name && <div>{lead.contact_name}</div>}
                    {lead.phone && <div className="text-[12px] text-slate-500">{lead.phone}</div>}
                    {lead.email && <div className="text-[12px] text-slate-500">{lead.email}</div>}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>{lead.status}</span>
                  </td>
                  <td className="p-3 text-slate-600">{formatDate(lead.created_at)}</td>
                  <td className="p-3 text-slate-600">{formatDate(lead.last_contacted_at)}</td>
                  <td className="p-3 text-slate-600">{formatDate(lead.next_follow_up_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
