import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getProviderDocumentSignedUrl, getProviderLogoSignedUrl } from "@/lib/provider-documents";
import { getProviderQuoteHistory } from "@/lib/provider-quote-history";
import type { CrmUserRow } from "@/lib/crm-types";
import type {
  LatestProviderLeadEmail,
  ProviderActivityRow,
  ProviderDocumentRow,
  ProviderEmailHistoryRow,
  ProviderFollowUpRow,
  ProviderIntakeVersionRow,
  ProviderLeadRow,
  ProviderNoteRow,
  ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import AdminProviderDetailClient from "./AdminProviderDetailClient";

export default async function AdminProviderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const crmAdmin = await requireCrmAdmin();
  const { id } = await params;
  const { added } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [
    { data: provider },
    { data: activities },
    { data: agents },
    { data: followUps },
    { data: notes },
    { data: documents },
    { data: scoreAdjustments },
    { data: intakeVersions },
  ] = await Promise.all([
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
    supabase.from("provider_notes").select("*").eq("provider_lead_id", id).order("created_at", { ascending: false }),
    supabase
      .from("provider_documents")
      .select("*")
      .eq("provider_lead_id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("provider_score_adjustments")
      .select("*")
      .eq("provider_lead_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("provider_intake_versions")
      .select("*")
      .eq("provider_lead_id", id)
      .order("completed_at", { ascending: false }),
  ]);

  if (!provider) {
    notFound();
  }

  const admin = getSupabaseAdmin();
  // cleaning_providers has no RLS policies at all (migration 0004 -
  // service-role only, not even for an authenticated admin session), so
  // this - like the quote-history lookup - must go through the
  // service-role client.
  const [{ data: latestEmail }, { data: emailHistory }, { data: cleaningProviders }, quoteHistory, logoUrl] =
    await Promise.all([
      admin
        .from("crm_lead_emails")
        .select(
          "email_type, to_email, subject, status, status_at, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at"
        )
        .eq("provider_lead_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("crm_lead_emails")
        .select(
          "id, created_at, email_type, to_email, subject, status, status_at, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at"
        )
        .eq("provider_lead_id", id)
        .order("created_at", { ascending: false }),
      admin.from("cleaning_providers").select("id, company_name").eq("status", "active").order("company_name"),
      getProviderQuoteHistory((provider as ProviderLeadRow).cleaning_provider_id),
      getProviderLogoSignedUrl((provider as ProviderLeadRow).logo_path),
    ]);

  const documentsWithUrls = await Promise.all(
    ((documents ?? []) as ProviderDocumentRow[]).map(async (document) => ({
      document,
      url: await getProviderDocumentSignedUrl(document.storage_path),
    }))
  );

  return (
    <AdminProviderDetailClient
      provider={provider as ProviderLeadRow}
      activities={(activities ?? []) as ProviderActivityRow[]}
      followUps={(followUps ?? []) as ProviderFollowUpRow[]}
      agents={(agents ?? []) as CrmUserRow[]}
      latestEmail={latestEmail as LatestProviderLeadEmail | null}
      emailHistory={(emailHistory ?? []) as ProviderEmailHistoryRow[]}
      notes={(notes ?? []) as ProviderNoteRow[]}
      documents={documentsWithUrls}
      scoreAdjustments={(scoreAdjustments ?? []) as ProviderScoreAdjustmentRow[]}
      intakeVersions={(intakeVersions ?? []) as ProviderIntakeVersionRow[]}
      quoteHistory={quoteHistory}
      cleaningProviders={(cleaningProviders ?? []) as { id: string; company_name: string }[]}
      logoUrl={logoUrl}
      currentUserId={crmAdmin.id}
      justAdded={added === "1"}
    />
  );
}
