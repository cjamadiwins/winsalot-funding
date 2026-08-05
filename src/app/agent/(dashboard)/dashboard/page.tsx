import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { AgentAttendanceRow, CrmFollowUpWithLead, CrmLeadRow } from "@/lib/crm-types";
import type { ProviderFollowUpWithLead } from "@/lib/provider-types";
import AgentDashboardClient from "./AgentDashboardClient";
import FollowUpCalendar from "./FollowUpCalendar";
import OverdueLeadsPanel from "./OverdueLeadsPanel";
import ProviderFollowUps from "./ProviderFollowUps";
import AttendanceCard from "./AttendanceCard";

export default async function AgentDashboardPage() {
  const crmUser = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_leads_agent_select_own / crm_followups_agent_select_own_lead)
  // already restricts both of these to leads assigned to the signed-in
  // agent, so no extra filtering is needed here.
  const [
    { data: leadsData, error: leadsError },
    { data: followUpsData, error: followUpsError },
    { data: providerFollowUpsData, error: providerFollowUpsError },
    { data: attendanceData, error: attendanceError },
  ] = await Promise.all([
    supabase.from("crm_leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("crm_followups")
      .select("*, crm_leads(id, business_name, phone, city, assigned_agent_id)")
      .eq("status", "pending")
      // crm_followups also holds opportunity- and provider-lead-targeted
      // rows (migrations 0013/0026) - this dashboard's Follow-Up Calendar
      // is lead-only, so exclude those explicitly rather than relying on
      // RLS alone (which permits all three target types).
      .not("lead_id", "is", null)
      .order("scheduled_at", { ascending: true }),
    // Provider Acquisition's own "Provider Follow-ups" section (brief
    // section 9) - deliberately a separate query/section from the
    // Follow-Up Calendar above, never mixed with customer-lead callbacks.
    supabase
      .from("crm_followups")
      .select(
        "*, provider_leads(id, business_name, contact_person, phone, email, status, assigned_agent_id, intake_completed_at, cleaning_provider_id)"
      )
      .eq("status", "pending")
      .not("provider_lead_id", "is", null)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("agent_attendance")
      .select("*")
      .eq("agent_id", crmUser.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const leads = (leadsData ?? []) as CrmLeadRow[];
  const followUps = (followUpsData ?? []) as CrmFollowUpWithLead[];
  const providerFollowUps = (providerFollowUpsData ?? []) as ProviderFollowUpWithLead[];
  const openShift = attendanceError ? null : ((attendanceData ?? null) as AgentAttendanceRow | null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[24px] font-bold text-[var(--color-ink-strong)]">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Welcome back, {crmUser.full_name || crmUser.email}.
          </p>
        </div>
        <Link
          href="/agent/leads/new"
          className="whitespace-nowrap rounded-full bg-[var(--color-accent)] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          + Add Lead
        </Link>
      </div>

      <AttendanceCard openShift={openShift} />
      {attendanceError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance: {attendanceError.message}
        </p>
      )}

      {!leadsError && !followUpsError && (
        <div className="mt-8">
          <OverdueLeadsPanel leads={leads} followUps={followUps} />
        </div>
      )}

      <h2 className="mt-8 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        Follow-Up Calendar
      </h2>
      {followUpsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load your follow-up calendar: {followUpsError.message}
        </p>
      )}
      {!followUpsError && (
        <div className="mt-3">
          <FollowUpCalendar followUps={followUps} leads={leads} />
        </div>
      )}

      <h2 className="mt-10 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        Provider Follow-ups
      </h2>
      {providerFollowUpsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load provider follow-ups: {providerFollowUpsError.message}
        </p>
      )}
      {!providerFollowUpsError && (
        <div className="mt-3">
          <ProviderFollowUps followUps={providerFollowUps} />
        </div>
      )}

      <h2 className="mt-10 font-heading text-[19px] font-bold text-[var(--color-ink-strong)]">
        My Leads
      </h2>

      {leadsError && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load leads: {leadsError.message}
        </p>
      )}

      {!leadsError && <AgentDashboardClient leads={leads} />}
    </div>
  );
}
