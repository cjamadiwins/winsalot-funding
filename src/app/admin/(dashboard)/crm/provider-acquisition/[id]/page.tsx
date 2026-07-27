import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import type {
  LatestProviderLeadEmail,
  ProviderActivityRow,
  ProviderFollowUpRow,
  ProviderLeadRow,
} from "@/lib/provider-types";
import AdminProviderDetailClient from "./AdminProviderDetailClient";

export default async function AdminProviderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  await requireCrmAdmin();
  const { id } = await params;
  const { added } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: provider }, { data: activities }, { data: agents }, { data: followUps }] = await Promise.all([
    supabase.from("provider_leads").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("provider_lead_id", id)
      .order("occurred_at", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
    supabase
      .from("crm_followups")
      .select("*")
      .eq("provider_lead_id", id)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
  ]);

  if (!provider) {
    notFound();
  }

  const admin = getSupabaseAdmin();
  const { data: latestEmail } = await admin
    .from("crm_lead_emails")
    .select(
      "email_type, to_email, subject, status, status_at, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at"
    )
    .eq("provider_lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <AdminProviderDetailClient
      provider={provider as ProviderLeadRow}
      activities={(activities ?? []) as ProviderActivityRow[]}
      followUps={(followUps ?? []) as ProviderFollowUpRow[]}
      agents={(agents ?? []) as CrmUserRow[]}
      latestEmail={latestEmail as LatestProviderLeadEmail | null}
      justAdded={added === "1"}
    />
  );
}
