import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  isHiddenLeadgenCampaignName,
  type LeadgenAppointmentStatus,
  type LeadgenCampaignRow,
  type LeadgenClientRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";
import LeadsListClient from "./LeadsListClient";

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenLeadsPage({
  searchParams,
}: {
  // status/followup/agent are set by the admin dashboard's clickable
  // stat cards and Results by Agent chart (see
  // /leadgen/admin/(dashboard)/page.tsx and ResultsByAgentChart.tsx) to
  // land here pre-filtered - status matches a LeadgenLeadStatus value
  // exactly, followup is "due_today", "due", or "overdue" ("due" and
  // "overdue" optionally paired with a due_from/due_to YYYY-MM-DD range
  // from the chart's active date filter), agent is a leadgen_users id.
  searchParams: Promise<{
    deleted?: string;
    status?: string;
    appointment_status?: string;
    followup?: string;
    agent?: string;
    due_from?: string;
    due_to?: string;
  }>;
}) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { deleted, status, appointment_status, followup, agent, due_from, due_to } = await searchParams;

  const [{ data: leads }, { data: clients }, { data: campaigns }, { data: agents }, { data: appointments }] = await Promise.all([
    admin.from("leadgen_leads").select("*").order("created_at", { ascending: false }),
    admin.from("leadgen_clients").select("*").order("name"),
    admin.from("leadgen_campaigns").select("*").order("name"),
    admin.from("leadgen_users").select("*").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
    // Most recent appointment per lead, for the Appointment Status
    // column - ordered oldest-first so the reduce below keeps the last
    // (most recent) one per lead_id.
    admin.from("leadgen_appointments").select("lead_id, status, created_at").order("created_at", { ascending: true }),
  ]);

  const appointmentStatusByLeadId: Record<string, LeadgenAppointmentStatus> = {};
  for (const appt of appointments ?? []) {
    if (appt.lead_id) appointmentStatusByLeadId[appt.lead_id] = appt.status;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">Every prospect across every client and campaign.</p>
        </div>
        <Link
          href="/leadgen/admin"
          className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-400"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <LeadsListClient
        leads={(leads ?? []) as LeadgenLeadRow[]}
        clients={(clients ?? []) as LeadgenClientRow[]}
        campaigns={((campaigns ?? []).filter((campaign) => !isHiddenLeadgenCampaignName(campaign.name))) as LeadgenCampaignRow[]}
        agents={(agents ?? []) as LeadgenUserRow[]}
        appointmentStatusByLeadId={appointmentStatusByLeadId}
        initialSuccessMessage={deleted === "1" ? "Lead deleted successfully." : null}
        initialStatusFilter={status}
        initialAppointmentStatusFilter={appointment_status}
        initialFollowUpFilter={followup === "due_today" || followup === "due" || followup === "overdue" ? followup : undefined}
        initialAgentFilter={agent}
        initialDueFrom={due_from}
        initialDueTo={due_to}
      />
    </div>
  );
}
