import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmActivityRow, CrmFollowUpRow, CrmOpportunityRow, CrmUserRow, LatestCrmLeadEmail } from "@/lib/crm-types";
import AdminOpportunityDetailClient from "./AdminOpportunityDetailClient";

export default async function AdminOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  // Admin already has full access to this page (requireCrmAdmin above) -
  // service-role read for crm_lead_emails specifically, same as the old
  // lead detail page, since that table has RLS enabled but no policies of
  // its own for the session client to rely on (see migration 0022).
  const admin = getSupabaseAdmin();

  const [{ data: opportunity }, { data: activities }, { data: followUps }, { data: agents }, { data: latestEmail }] =
    await Promise.all([
      supabase.from("crm_opportunities").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("crm_activities")
        .select("*")
        .eq("opportunity_id", id)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("crm_followups")
        .select("*")
        .eq("opportunity_id", id)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true }),
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
    ]);

  if (!opportunity) {
    notFound();
  }

  return (
    <AdminOpportunityDetailClient
      opportunity={opportunity as CrmOpportunityRow}
      activities={(activities ?? []) as CrmActivityRow[]}
      followUps={(followUps ?? []) as CrmFollowUpRow[]}
      agents={(agents ?? []) as CrmUserRow[]}
      latestEmail={latestEmail as LatestCrmLeadEmail | null}
    />
  );
}
