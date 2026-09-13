import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getEmailSuppression, type CrmEmailSuppressionRow } from "@/lib/crm-email-suppression";
import { checkDncSuppression, type DncSuppressionRow } from "@/lib/dnc-suppression";
import { getWinsalotBookingUrlBase } from "@/lib/send-prospect-email";
import type { CrmActivityRow, CrmFollowUpRow, CrmOpportunityRow, CrmUserRow, LatestCrmLeadEmail } from "@/lib/crm-types";
import type { EmailHistoryEntry } from "@/components/EmailHistoryPanel";
import type { CrmOpportunityScoreRow } from "@/lib/opportunity-finder";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";

export type AdminOpportunityDetailData = {
  opportunity: CrmOpportunityRow;
  activities: CrmActivityRow[];
  followUps: CrmFollowUpRow[];
  agents: CrmUserRow[];
  latestEmail: LatestCrmLeadEmail | null;
  emailHistory: EmailHistoryEntry[];
  isEmailSuppressed: boolean;
  suppression: CrmEmailSuppressionRow | null;
  // Shared cross-CRM Do Not Contact restriction - see agent-opportunity-detail-data.ts.
  dncSuppression: DncSuppressionRow | null;
  bookingUrl: string;
  appointments: WinsalotAppointmentRow[];
  score: CrmOpportunityScoreRow | null;
};

// One Growth CRM opportunity's full detail record - the exact same query
// set the standalone /admin/crm/opportunities/[id] page uses, extracted
// here so the Opportunity Finder dashboard modal's "View Lead" can fetch
// the same record on demand (via a server action) without duplicating
// this query logic or introducing a second, lighter detail view.
export async function loadAdminOpportunityDetail(id: string): Promise<AdminOpportunityDetailData | null> {
  const supabase = await createSupabaseServerClient();
  // Admin already has full access to this record (caller must have run
  // requireCrmAdmin) - service-role read for crm_lead_emails specifically,
  // since that table has RLS enabled but no policies of its own for the
  // session client to rely on (see migration 0022).
  const admin = getSupabaseAdmin();

  const [
    { data: opportunity },
    { data: activities },
    { data: followUps },
    { data: agents },
    { data: latestEmail },
    { data: emailHistory },
    { data: appointments },
    { data: score },
  ] = await Promise.all([
    supabase.from("crm_opportunities").select("*").eq("id", id).maybeSingle(),
    supabase.from("crm_activities").select("*").eq("opportunity_id", id).order("occurred_at", { ascending: false }),
    supabase.from("crm_followups").select("*").eq("opportunity_id", id).eq("status", "pending").order("scheduled_at", { ascending: true }),
    supabase.from("crm_users").select("*").order("full_name"),
    admin
      .from("crm_lead_emails")
      .select(
        "email_type, to_email, subject, status, status_at, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at"
      )
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("crm_lead_emails")
      .select("id, created_at, email_type, to_email, subject, status, status_at, agent_id")
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("winsalot_appointments").select("*").eq("opportunity_id", id).order("appointment_start_at", { ascending: false }),
    supabase.from("crm_opportunity_scores").select("*").eq("opportunity_id", id).maybeSingle(),
  ]);

  if (!opportunity) return null;

  const agentNameById = new Map(((agents ?? []) as CrmUserRow[]).map((a) => [a.id, a.full_name || a.email]));
  const emailHistoryEntries: EmailHistoryEntry[] = (emailHistory ?? []).map((row) => ({
    ...row,
    senderName: row.agent_id ? (agentNameById.get(row.agent_id) ?? null) : null,
  }));

  const suppression = opportunity.email ? await getEmailSuppression(opportunity.email) : null;
  const dncSuppression = await checkDncSuppression({ phone: opportunity.phone, email: opportunity.email });

  return {
    opportunity: opportunity as CrmOpportunityRow,
    activities: (activities ?? []) as CrmActivityRow[],
    followUps: (followUps ?? []) as CrmFollowUpRow[],
    agents: (agents ?? []) as CrmUserRow[],
    latestEmail: latestEmail as LatestCrmLeadEmail | null,
    emailHistory: emailHistoryEntries,
    isEmailSuppressed: !!suppression?.active,
    suppression: suppression as CrmEmailSuppressionRow | null,
    dncSuppression,
    bookingUrl: getWinsalotBookingUrlBase(),
    appointments: (appointments ?? []) as WinsalotAppointmentRow[],
    score: score as CrmOpportunityScoreRow | null,
  };
}
