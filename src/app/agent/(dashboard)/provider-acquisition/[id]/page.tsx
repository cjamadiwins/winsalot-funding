import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import { getProviderDocumentSignedUrl, getProviderLogoSignedUrl } from "@/lib/provider-documents";
import { getProviderQuoteHistory } from "@/lib/provider-quote-history";
import type {
  LatestProviderLeadEmail,
  ProviderDocumentRow,
  ProviderEmailHistoryRow,
  ProviderFollowUpRow,
  ProviderIntakeVersionRow,
  ProviderLeadRow,
  ProviderNoteRow,
  ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import type { ProviderActivityRow } from "@/lib/provider-types";
import ProviderDetailClient from "./ProviderDetailClient";

export default async function AgentProviderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const crmUser = await requireCrmUser();
  const { id } = await params;
  const { added } = await searchParams;
  const supabase = await createSupabaseServerClient();

  // RLS (provider_leads_agent_select_own) means this returns null both
  // when the provider doesn't exist and when it exists but isn't assigned
  // to this agent - either way, a 404 is the correct response.
  const [
    { data: provider },
    { data: activities },
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

  // Only reached once RLS has already confirmed this agent owns the
  // provider lead - crm_lead_emails has no RLS policies of its own (see
  // migration 0022/0026), same access pattern as the lead-side detail page.
  const admin = getSupabaseAdmin();
  const [{ data: latestEmail }, { data: emailHistory }, quoteHistory, logoUrl] = await Promise.all([
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
    <ProviderDetailClient
      provider={provider as ProviderLeadRow}
      activities={(activities ?? []) as ProviderActivityRow[]}
      followUps={(followUps ?? []) as ProviderFollowUpRow[]}
      latestEmail={latestEmail as LatestProviderLeadEmail | null}
      emailHistory={(emailHistory ?? []) as ProviderEmailHistoryRow[]}
      notes={(notes ?? []) as ProviderNoteRow[]}
      documents={documentsWithUrls}
      scoreAdjustments={(scoreAdjustments ?? []) as ProviderScoreAdjustmentRow[]}
      intakeVersions={(intakeVersions ?? []) as ProviderIntakeVersionRow[]}
      quoteHistory={quoteHistory}
      logoUrl={logoUrl}
      currentUserId={crmUser.id}
      justAdded={added === "1"}
    />
  );
}
