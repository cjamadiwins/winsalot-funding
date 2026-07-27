import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import { getProviderDocumentSignedUrl, getProviderLogoSignedUrl } from "@/lib/provider-documents";
import { getProviderQuoteHistory } from "@/lib/provider-quote-history";
import type {
  CleaningProviderRow,
  LatestProviderLeadEmail,
  ProviderActivityRow,
  ProviderDocumentRow,
  ProviderEmailHistoryRow,
  ProviderFollowUpRow,
  ProviderNoteRow,
  ProviderScoreAdjustmentRow,
} from "@/lib/provider-types";
import ProviderDetailClient from "./ProviderDetailClient";

export default async function AgentProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const crmUser = await requireCrmUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS (cleaning_providers_agent_select_own) means this returns null both
  // when the provider doesn't exist and when it isn't assigned to this
  // agent - either way, a 404 is the correct response.
  const [{ data: provider }, { data: notes }, { data: documents }, { data: scoreAdjustments }, { data: linkedLeads }] =
    await Promise.all([
      supabase.from("cleaning_providers").select("*").eq("id", id).maybeSingle(),
      supabase.from("provider_notes").select("*").eq("cleaning_provider_id", id).order("created_at", { ascending: false }),
      supabase
        .from("provider_documents")
        .select("*")
        .eq("cleaning_provider_id", id)
        .is("removed_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("provider_score_adjustments")
        .select("*")
        .eq("cleaning_provider_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("provider_leads").select("id, business_name").eq("cleaning_provider_id", id),
    ]);

  if (!provider) {
    notFound();
  }

  const linkedLeadIds = (linkedLeads ?? []).map((l) => l.id as string);
  const leadOrFilter = linkedLeadIds.length > 0 ? `,provider_lead_id.in.(${linkedLeadIds.join(",")})` : "";

  const admin = getSupabaseAdmin();
  const [{ data: activities }, { data: followUps }, { data: latestEmail }, { data: emailHistory }, quoteHistory, logoUrl] =
    await Promise.all([
      supabase
        .from("crm_activities")
        .select("*")
        .or(`cleaning_provider_id.eq.${id}${leadOrFilter}`)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("crm_followups")
        .select("*")
        .or(`cleaning_provider_id.eq.${id}${leadOrFilter}`)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true }),
      admin
        .from("crm_lead_emails")
        .select(
          "email_type, to_email, subject, status, status_at, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at"
        )
        .or(`cleaning_provider_id.eq.${id}${leadOrFilter}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("crm_lead_emails")
        .select(
          "id, created_at, email_type, to_email, subject, status, status_at, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at"
        )
        .or(`cleaning_provider_id.eq.${id}${leadOrFilter}`)
        .order("created_at", { ascending: false }),
      getProviderQuoteHistory(id),
      getProviderLogoSignedUrl((provider as CleaningProviderRow).logo_path),
    ]);

  const documentsWithUrls = await Promise.all(
    ((documents ?? []) as ProviderDocumentRow[]).map(async (document) => ({
      document,
      url: await getProviderDocumentSignedUrl(document.storage_path),
    }))
  );

  return (
    <ProviderDetailClient
      provider={provider as CleaningProviderRow}
      activities={(activities ?? []) as ProviderActivityRow[]}
      followUps={(followUps ?? []) as ProviderFollowUpRow[]}
      notes={(notes ?? []) as ProviderNoteRow[]}
      documents={documentsWithUrls}
      scoreAdjustments={(scoreAdjustments ?? []) as ProviderScoreAdjustmentRow[]}
      emailHistory={(emailHistory ?? []) as ProviderEmailHistoryRow[]}
      latestEmail={latestEmail as LatestProviderLeadEmail | null}
      quoteHistory={quoteHistory}
      logoUrl={logoUrl}
      linkedLead={linkedLeadIds.length > 0 ? (linkedLeads![0] as { id: string; business_name: string }) : null}
      currentUserId={crmUser.id}
    />
  );
}
