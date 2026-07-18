import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmActivityRow, CrmLeadRow, CrmUserRow } from "@/lib/crm-types";
import type { QuoteRequestRow } from "@/lib/admin-types";
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

  let linkedQuote: QuoteRequestRow | null = null;
  if (leadRow.quote_request_id) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("quote_requests")
      .select("*")
      .eq("id", leadRow.quote_request_id)
      .maybeSingle();
    linkedQuote = data;
  }

  return (
    <AdminLeadDetailClient
      lead={leadRow}
      activities={(activities ?? []) as CrmActivityRow[]}
      agents={(agents ?? []) as CrmUserRow[]}
      linkedQuote={linkedQuote}
    />
  );
}
