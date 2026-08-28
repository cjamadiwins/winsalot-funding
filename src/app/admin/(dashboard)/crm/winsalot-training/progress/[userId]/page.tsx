import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchAgentProgressDetail } from "@/lib/crm-training-data";
import AdminTrainingProgressDetailClient from "@/components/crm-training/AdminTrainingProgressDetailClient";
import { resetAgentModuleProgressAction } from "../../actions";

// "Open an individual agent's training record" / "See which modules an
// agent has completed" / "See completion dates and times" / "Reset an
// agent's module progress when necessary, with confirmation."
export default async function AdminTrainingAgentProgressPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireCrmAdmin();
  const { userId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await fetchAgentProgressDetail(supabase, userId);
  if (error || !data.agent) notFound();

  return (
    <AdminTrainingProgressDetailClient agent={data.agent} modules={data.modules} resetAction={resetAgentModuleProgressAction} />
  );
}
