import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import { isEmailSuppressed } from "@/lib/crm-email-suppression";
import { getWinsalotBookingUrlBase } from "@/lib/send-prospect-email";
import type { CrmActivityRow, CrmFollowUpRow, CrmOpportunityRow } from "@/lib/crm-types";
import type { EmailHistoryEntry } from "@/components/EmailHistoryPanel";
import OpportunityDetailClient from "./OpportunityDetailClient";

export default async function AgentOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const crmUser = await requireCrmUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  // crm_lead_emails has RLS enabled but no policies of its own (service-role
  // only, see migration 0022) - same service-role read the admin detail
  // page already uses for its Email Status/History sections. The
  // opportunity itself is still only ever readable above via the
  // session-scoped client, so an agent can never reach this page (or this
  // email history) for a prospect not assigned to them.
  const admin = getSupabaseAdmin();

  // RLS (crm_opportunities_agent_select_own) returns nothing for an
  // opportunity not currently assigned to this agent.
  const [{ data: opportunity }, { data: activities }, { data: followUps }, { data: emailHistory }] = await Promise.all([
    supabase.from("crm_opportunities").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("opportunity_id", id)
      .order("occurred_at", { ascending: false }),
    supabase.from("crm_followups").select("*").eq("opportunity_id", id).order("scheduled_at", { ascending: true }),
    admin
      .from("crm_lead_emails")
      .select("id, created_at, email_type, to_email, subject, status, status_at, agent_id")
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!opportunity) {
    notFound();
  }

  const senderIds = [...new Set((emailHistory ?? []).map((row) => row.agent_id).filter((v): v is string => !!v))];
  const { data: senders } =
    senderIds.length > 0 ? await admin.from("crm_users").select("id, full_name, email").in("id", senderIds) : { data: [] };
  const senderNameById = new Map((senders ?? []).map((s) => [s.id, s.full_name || s.email]));
  const emailHistoryEntries: EmailHistoryEntry[] = (emailHistory ?? []).map((row) => ({
    ...row,
    senderName: row.agent_id ? (senderNameById.get(row.agent_id) ?? null) : null,
  }));

  const isSuppressed = opportunity.email ? await isEmailSuppressed(opportunity.email) : false;

  return (
    <OpportunityDetailClient
      opportunity={opportunity as CrmOpportunityRow}
      activities={(activities ?? []) as CrmActivityRow[]}
      followUps={(followUps ?? []) as CrmFollowUpRow[]}
      currentAgentId={crmUser.id}
      emailHistory={emailHistoryEntries}
      isEmailSuppressed={isSuppressed}
      bookingUrl={getWinsalotBookingUrlBase()}
    />
  );
}
