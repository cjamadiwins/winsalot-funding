import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmActivityRow, CrmLeadRow, CrmUserRow } from "@/lib/crm-types";
import type {
  ProviderQuoteSubmissionRow,
  ProviderQuoteTokenRow,
  ProviderRow,
  QuoteRequestRow,
} from "@/lib/admin-types";
import AdminLeadDetailClient from "./AdminLeadDetailClient";

export default async function AdminCrmLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: lead }, { data: activities }, { data: agents }] = await Promise.all([
    supabase.from("crm_leads").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false }),
    supabase.from("crm_users").select("*").order("full_name"),
  ]);

  if (!lead) {
    notFound();
  }

  const leadRow = lead as CrmLeadRow;

  // Fetched with the service-role client, same as /admin/requests/[id] —
  // safe here because this whole page is already gated by
  // requireCrmAdmin() above, and quote_requests has no RLS policies of
  // its own to rely on instead (see migration 0003).
  let linkedQuote: QuoteRequestRow | null = null;
  let providers: ProviderRow[] = [];
  let tokens: ProviderQuoteTokenRow[] = [];
  let submissions: ProviderQuoteSubmissionRow[] = [];

  if (leadRow.quote_request_id) {
    const admin = getSupabaseAdmin();
    const [{ data: quote }, { data: providerRows }, { data: tokenRows }, { data: submissionRows }] =
      await Promise.all([
        admin.from("quote_requests").select("*").eq("id", leadRow.quote_request_id).maybeSingle(),
        admin.from("cleaning_providers").select("*").order("company_name"),
        admin
          .from("provider_quote_tokens")
          .select("*")
          .eq("quote_request_id", leadRow.quote_request_id)
          .order("created_at", { ascending: false }),
        admin
          .from("provider_quote_submissions")
          .select("*")
          .eq("quote_request_id", leadRow.quote_request_id)
          .order("created_at", { ascending: false }),
      ]);
    linkedQuote = quote;
    providers = (providerRows ?? []) as ProviderRow[];
    tokens = (tokenRows ?? []) as ProviderQuoteTokenRow[];
    submissions = (submissionRows ?? []) as ProviderQuoteSubmissionRow[];
  }

  return (
    <AdminLeadDetailClient
      lead={leadRow}
      activities={(activities ?? []) as CrmActivityRow[]}
      agents={(agents ?? []) as CrmUserRow[]}
      linkedQuote={linkedQuote}
      providers={providers}
      tokens={tokens}
      submissions={submissions}
    />
  );
}
