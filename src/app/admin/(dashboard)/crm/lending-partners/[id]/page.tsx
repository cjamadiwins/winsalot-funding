import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchLendingPartnerDetail } from "@/lib/crm-lending-partners-data";
import type { CrmUserRow } from "@/lib/crm-types";
import LendingPartnerProfileClient from "@/components/crm-lending-partners/LendingPartnerProfileClient";
import {
  updateLendingPartnerAction,
  assignLendingPartnerAgentAction,
  logLendingPartnerActivityAction,
  archiveLendingPartnerAction,
  unarchiveLendingPartnerAction,
} from "../actions";

export default async function AdminLendingPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, { data: agents }] = await Promise.all([
    fetchLendingPartnerDetail(supabase, id),
    supabase.from("crm_users").select("*").eq("role", "agent").order("full_name"),
  ]);

  if (error || !data) notFound();

  return (
    <LendingPartnerProfileClient
      partner={data.partner}
      activities={data.activities}
      agents={((agents ?? []) as CrmUserRow[]).map((a) => ({ id: a.id, full_name: a.full_name, email: a.email }))}
      updateAction={updateLendingPartnerAction}
      assignAgentAction={assignLendingPartnerAgentAction}
      logActivityAction={logLendingPartnerActivityAction}
      archiveAction={archiveLendingPartnerAction}
      unarchiveAction={unarchiveLendingPartnerAction}
    />
  );
}
