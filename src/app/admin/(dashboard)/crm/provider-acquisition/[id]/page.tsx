import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getProviderDocumentSignedUrl, getProviderLogoSignedUrl } from "@/lib/provider-documents";
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
      .from("provider_intake_versions")
      .select("*")
      .eq("provider_lead_id", id)
      .order("completed_at", { ascending: false }),
  ]);

  if (!provider) {
    notFound();
  }

  // Once approved, this record's permanent operational Provider Profile
  // (cleaning_providers) is the profile used everywhere - see
  // src/app/agent/(dashboard)/provider-acquisition/[id]/page.tsx for the
  // agent-side equivalent of this redirect.
  const providerLead = provider as ProviderLeadRow;
  if (providerLead.cleaning_provider_id) {
    redirect(`/admin/providers/${providerLead.cleaning_provider_id}`);
  }

  const admin = getSupabaseAdmin();
  const [{ data: latestEmail }, { data: emailHistory }, logoUrl] = await Promise.all([
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
    getProviderLogoSignedUrl(providerLead.logo_path),
  ]);

  const documentsWithUrls = await Promise.all(
    ((documents ?? []) as ProviderDocumentRow[]).map(async (document) => ({
      document,
      url: await getProviderDocumentSignedUrl(document.storage_path),
    }))
  );

  return (
    <AdminProviderDetailClient
      provider={providerLead}
      activities={(activities ?? []) as ProviderActivityRow[]}
      followUps={(followUps ?? []) as ProviderFollowUpRow[]}
      agents={(agents ?? []) as CrmUserRow[]}
      latestEmail={latestEmail as LatestProviderLeadEmail | null}
      emailHistory={(emailHistory ?? []) as ProviderEmailHistoryRow[]}
      notes={(notes ?? []) as ProviderNoteRow[]}
      documents={documentsWithUrls}
      intakeVersions={(intakeVersions ?? []) as ProviderIntakeVersionRow[]}
      logoUrl={logoUrl}
      currentUserId={crmAdmin.id}
      justAdded={added === "1"}
    />
  );
}
