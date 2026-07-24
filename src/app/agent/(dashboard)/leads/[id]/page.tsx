import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmUser } from "@/lib/crm-auth";
import type { CrmActivityRow, CrmFollowUpRow, CrmLeadRow, LatestCrmLeadEmail } from "@/lib/crm-types";
import type { QuoteRequestRow } from "@/lib/admin-types";
import LeadDetailClient from "./LeadDetailClient";

export default async function AgentLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  await requireCrmUser();
  const { id } = await params;
  const { added } = await searchParams;
  const supabase = await createSupabaseServerClient();

  // RLS (crm_leads_agent_select_own) means this returns null both when the
  // lead doesn't exist and when it exists but isn't assigned to this
  // agent - either way, a 404 is the correct response.
  const [{ data: lead }, { data: activities }, { data: followUps }] = await Promise.all([
    supabase.from("crm_leads").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("crm_followups")
      .select("*")
      .eq("lead_id", id)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
  ]);

  if (!lead) {
    notFound();
  }

  const leadRow = lead as CrmLeadRow;

  // Only reached once RLS has already confirmed this agent owns the lead,
  // so it's safe to look up the linked quote by id with the service-role
  // client (quote_requests has no RLS policies of its own — see migration
  // 0003 — this is the same access pattern the /admin dashboard uses).
  // Only a display-safe subset of columns is selected; nothing about the
  // provider's private submission or raw customer/provider links.
  let linkedQuote: Pick<
    QuoteRequestRow,
    | "status"
    | "customer_quote_provider_name"
    | "customer_quote_price"
    | "customer_quote_price_type"
    | "customer_quote_sent_at"
    | "customer_response"
    | "customer_response_at"
  > | null = null;

  if (leadRow.quote_request_id) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("quote_requests")
      .select(
        "status, customer_quote_provider_name, customer_quote_price, customer_quote_price_type, customer_quote_sent_at, customer_response, customer_response_at"
      )
      .eq("id", leadRow.quote_request_id)
      .maybeSingle();
    linkedQuote = data;
  }

  // Same access pattern as linkedQuote above: only reached once RLS has
  // already confirmed this agent owns the lead, so it's safe to read the
  // per-event delivery timestamps for their most recently sent tracked
  // email with the service-role client (crm_lead_emails has no RLS
  // policies of its own - see migration 0022).
  const admin = getSupabaseAdmin();
  const { data: latestEmail } = await admin
    .from("crm_lead_emails")
    .select(
      "email_type, to_email, subject, status, status_at, sent_at, delivered_at, delayed_at, bounced_at, complained_at, opened_at, clicked_at, failed_at"
    )
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <LeadDetailClient
      lead={leadRow}
      activities={(activities ?? []) as CrmActivityRow[]}
      followUps={(followUps ?? []) as CrmFollowUpRow[]}
      linkedQuote={linkedQuote}
      latestEmail={latestEmail as LatestCrmLeadEmail | null}
      justAdded={added === "1"}
    />
  );
}
