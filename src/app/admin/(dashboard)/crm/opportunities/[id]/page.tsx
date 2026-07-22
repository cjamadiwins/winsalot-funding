import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type {
  ActiveCleaningOpportunityRow,
  OpportunityActivityRow,
  OpportunityAuditLogRow,
  OpportunityFollowUpRow,
} from "@/lib/opportunities/types";
import type { CrmUserRow } from "@/lib/crm-types";
import AdminOpportunityDetailClient from "./AdminOpportunityDetailClient";

export default async function AdminOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: opportunity }, { data: activities }, { data: followUps }, { data: auditLog }, { data: agents }] =
    await Promise.all([
      supabase.from("active_cleaning_opportunities").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("crm_activities")
        .select("*")
        .eq("opportunity_id", id)
        .order("occurred_at", { ascending: false }),
      supabase.from("crm_followups").select("*").eq("opportunity_id", id).order("scheduled_at", { ascending: true }),
      supabase
        .from("active_cleaning_opportunities_audit_log")
        .select("*")
        .eq("opportunity_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("crm_users").select("*").order("full_name"),
    ]);

  if (!opportunity) {
    notFound();
  }

  return (
    <AdminOpportunityDetailClient
      opportunity={opportunity as ActiveCleaningOpportunityRow}
      activities={(activities ?? []) as OpportunityActivityRow[]}
      followUps={(followUps ?? []) as OpportunityFollowUpRow[]}
      auditLog={(auditLog ?? []) as OpportunityAuditLogRow[]}
      agents={(agents ?? []) as CrmUserRow[]}
    />
  );
}
