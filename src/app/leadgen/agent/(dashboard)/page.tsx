import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LEADGEN_LEAD_STATUS_STYLES,
  LEADGEN_STAT_CARD_STYLES,
  isLeadgenFollowUpDueToday,
  isLeadgenFollowUpOverdue,
  type LeadgenAgentAttendanceRow,
  type LeadgenFollowUpWithLead,
  type LeadgenLeadRow,
} from "@/lib/leadgen-types";
import ClickableStatCard from "@/components/leadgen/ClickableStatCard";
import { completeFollowUpAction } from "./leads/[id]/actions";
import LeadgenAttendanceCard from "./LeadgenAttendanceCard";

export default async function LeadgenAgentDashboardPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  const [{ data: leads }, { data: followUps }, { data: attendanceData, error: attendanceError }] = await Promise.all([
    supabase.from("leadgen_leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("leadgen_followups")
      .select("*, leadgen_leads(id, business_name, contact_name, phone, email, status, next_follow_up_at)")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("leadgen_agent_attendance")
      .select("*")
      .eq("agent_id", agent.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const myLeads = (leads ?? []) as LeadgenLeadRow[];
  const openShift = attendanceError ? null : ((attendanceData ?? null) as LeadgenAgentAttendanceRow | null);
  // Only count/show a follow-up if it's still its lead's authoritative
  // upcoming one (lead.next_follow_up_at === this row's scheduled_at) -
  // the same source of truth the Leads page's Due Today/Overdue filters
  // use (isLeadgenNextFollowUpDueToday/Overdue on next_follow_up_at), so
  // this list and its count can never drift out of sync with the Leads
  // page even if a stale "pending" row is ever left behind by a bug
  // elsewhere.
  const allFollowUps = ((followUps ?? []) as LeadgenFollowUpWithLead[]).filter(
    (followUp) => followUp.leadgen_leads?.next_follow_up_at === followUp.scheduled_at
  );
  const dueToday = allFollowUps.filter(isLeadgenFollowUpDueToday);
  const overdue = allFollowUps.filter(isLeadgenFollowUpOverdue);

  const statusCounts = new Map<string, number>();
  for (const lead of myLeads) statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {agent.full_name}</h1>
      <p className="mt-1 text-sm text-slate-500">{myLeads.length} leads assigned to you.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ClickableStatCard
          href="/leadgen/agent/leads"
          label="My Leads"
          value={String(myLeads.length)}
          colorClass={LEADGEN_STAT_CARD_STYLES.leads}
        />
        <ClickableStatCard
          href="/leadgen/agent/leads?followup=due_today"
          label="Due Today"
          value={String(dueToday.length)}
          colorClass={LEADGEN_STAT_CARD_STYLES.dueToday}
        />
        <ClickableStatCard
          href="/leadgen/agent/leads?followup=overdue"
          label="Overdue"
          value={String(overdue.length)}
          colorClass={LEADGEN_STAT_CARD_STYLES.overdue}
        />
        <ClickableStatCard
          href={`/leadgen/agent/leads?status=${encodeURIComponent("Interested")}`}
          label="Interested"
          value={String(statusCounts.get("Interested") ?? 0)}
          colorClass={LEADGEN_STAT_CARD_STYLES.interested}
        />
      </div>

      <LeadgenAttendanceCard openShift={openShift} />
      {attendanceError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance: {attendanceError.message}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FollowUpGroup title="Overdue" items={overdue} emphasis="danger" />
        <FollowUpGroup title="Due Today" items={dueToday} emphasis="warn" />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Training</h2>
        <p className="mt-2 text-[13.5px] text-slate-600">
          Keep the Brent&apos;s Essentials call script open while dialing to stay consistent on every call.
        </p>
        <Link href="/leadgen/agent/training" className="mt-3 inline-block text-[13.5px] font-semibold text-sky-600 hover:text-sky-700">
          Open Training
        </Link>
      </section>
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
