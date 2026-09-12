import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isEmailSuppressed } from "@/lib/crm-email-suppression";
import { getWinsalotBookingUrlBase } from "@/lib/send-prospect-email";
import type { CrmActivityRow, CrmFollowUpRow, CrmOpportunityRow } from "@/lib/crm-types";
import type { EmailHistoryEntry } from "@/components/EmailHistoryPanel";
import type { CrmOpportunityScoreRow } from "@/lib/opportunity-finder";

export type AgentOpportunityDetailData = {
  opportunity: CrmOpportunityRow;
  activities: CrmActivityRow[];
  followUps: CrmFollowUpRow[];
  emailHistory: EmailHistoryEntry[];
  isEmailSuppressed: boolean;
  bookingUrl: string;
  // Not accepted by OpportunityDetailClient (the standalone agent page
  // never showed it) - carried here only so the Opportunity Finder
  // dashboard modal can show the same "why this score" explanation the
  // admin's own detail view already displays, without changing the
  // standalone page.
  score: CrmOpportunityScoreRow | null;
};

// One Growth CRM opportunity's full detail record, scoped to the
// signed-in agent - the exact same query set the standalone
// /agent/opportunities/[id] page uses (RLS via crm_opportunities_agent_
// select_own already returns nothing for an opportunity not assigned to
// this agent), extracted here so the Opportunity Finder dashboard modal's
// "View Opportunity" can fetch the same record on demand.
export async function loadAgentOpportunityDetail(id: string): Promise<AgentOpportunityDetailData | null> {
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdmin();

  const [{ data: opportunity }, { data: activities }, { data: followUps }, { data: emailHistory }, { data: score }] = await Promise.all([
    supabase.from("crm_opportunities").select("*").eq("id", id).maybeSingle(),
    supabase.from("crm_activities").select("*").eq("opportunity_id", id).order("occurred_at", { ascending: false }),
    supabase.from("crm_followups").select("*").eq("opportunity_id", id).order("scheduled_at", { ascending: true }),
    admin
      .from("crm_lead_emails")
      .select("id, created_at, email_type, to_email, subject, status, status_at, agent_id")
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("crm_opportunity_scores").select("*").eq("opportunity_id", id).maybeSingle(),
  ]);

  if (!opportunity) return null;

  const senderIds = [...new Set((emailHistory ?? []).map((row) => row.agent_id).filter((v): v is string => !!v))];
  const { data: senders } = senderIds.length > 0 ? await admin.from("crm_users").select("id, full_name, email").in("id", senderIds) : { data: [] };
  const senderNameById = new Map((senders ?? []).map((s) => [s.id, s.full_name || s.email]));
  const emailHistoryEntries: EmailHistoryEntry[] = (emailHistory ?? []).map((row) => ({
    ...row,
    senderName: row.agent_id ? (senderNameById.get(row.agent_id) ?? null) : null,
  }));

  const suppressed = opportunity.email ? await isEmailSuppressed(opportunity.email) : false;

  return {
    opportunity: opportunity as CrmOpportunityRow,
    activities: (activities ?? []) as CrmActivityRow[],
    followUps: (followUps ?? []) as CrmFollowUpRow[],
    emailHistory: emailHistoryEntries,
    isEmailSuppressed: suppressed,
    bookingUrl: getWinsalotBookingUrlBase(),
    score: score as CrmOpportunityScoreRow | null,
  };
}
