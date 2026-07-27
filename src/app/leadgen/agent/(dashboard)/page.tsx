import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LEADGEN_LEAD_STATUS_STYLES,
  isLeadgenFollowUpDueToday,
  isLeadgenFollowUpOverdue,
  type LeadgenFollowUpWithLead,
  type LeadgenLeadRow,
} from "@/lib/leadgen-types";
import { completeFollowUpAction } from "./leads/[id]/actions";

export default async function LeadgenAgentDashboardPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const [{ data: leads }, { data: followUps }] = await Promise.all([
    supabase.from("leadgen_leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("leadgen_followups")
      .select("*, leadgen_leads(id, business_name, contact_name, phone, email, status)")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
  ]);

  const myLeads = (leads ?? []) as LeadgenLeadRow[];
  const allFollowUps = (followUps ?? []) as LeadgenFollowUpWithLead[];
  const dueToday = allFollowUps.filter(isLeadgenFollowUpDueToday);
  const overdue = allFollowUps.filter(isLeadgenFollowUpOverdue);

  const statusCounts = new Map<string, number>();
  for (const lead of myLeads) statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {agent.full_name}</h1>
      <p className="mt-1 text-sm text-slate-500">{myLeads.length} leads assigned to you.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="My Leads" value={String(myLeads.length)} />
        <StatCard label="Due Today" value={String(dueToday.length)} />
        <StatCard label="Overdue" value={String(overdue.length)} emphasis={overdue.length > 0 ? "text-rose-700" : undefined} />
        <StatCard label="Interested" value={String(statusCounts.get("Interested") ?? 0)} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FollowUpGroup title="Overdue" items={overdue} emphasis="danger" />
        <FollowUpGroup title="Due Today" items={dueToday} emphasis="warn" />
      </div>
    </div>
  );
}

function StatCard({ label, value, emphasis }: { label: string; value: string; emphasis?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-[18px] font-bold ${emphasis ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function FollowUpGroup({ title, items, emphasis }: { title: string; items: LeadgenFollowUpWithLead[]; emphasis: "danger" | "warn" }) {
  const cardStyle = emphasis === "danger" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50";
  const titleStyle = emphasis === "danger" ? "text-rose-700" : "text-amber-700";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className={`text-[11.5px] font-semibold uppercase tracking-wide ${titleStyle}`}>
        {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">Nothing here.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((followUp) => {
            const lead = followUp.leadgen_leads;
            return (
              <li key={followUp.id} className={`rounded-lg border p-3.5 text-[13.5px] ${cardStyle}`}>
                <div className="flex items-center justify-between">
                  <Link href={`/leadgen/agent/leads/${followUp.lead_id}`} className="font-semibold text-slate-900 hover:text-sky-600">
                    {lead?.business_name ?? "Lead"}
                  </Link>
                  <span className="text-[12px] text-slate-500">{new Date(followUp.scheduled_at).toLocaleString()}</span>
                </div>
                {lead?.status && (
                  <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_LEAD_STATUS_STYLES[lead.status]}`}>
                    {lead.status}
                  </span>
                )}
                {followUp.note && <p className="mt-1.5 text-slate-700">{followUp.note}</p>}
                <form
                  action={async () => {
                    "use server";
                    await completeFollowUpAction(followUp.id, followUp.lead_id);
                  }}
                  className="mt-2"
                >
                  <button type="submit" className="text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800">
                    Mark Completed
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
