import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchModuleForAdmin } from "@/lib/crm-training-data";
import TrainingModuleReader from "@/components/crm-training/TrainingModuleReader";
import { markModuleCompleteAction, markModuleOpenedAction } from "@/lib/crm-training-actions";
import type { CrmTrainingProgressRow } from "@/lib/crm-training-types";

// "Preview modules before publishing" + "View the training exactly as an
// agent sees it." Admins can open ANY module here regardless of
// is_active (fetchModuleForAdmin uses the admin-only RLS policy, not the
// agent active+assigned one) - a draft module shows a "not published
// yet" banner instead of being hidden.
export default async function AdminTrainingModuleReadPage({ params }: { params: Promise<{ moduleId: string }> }) {
  const admin = await requireCrmAdmin();
  const { moduleId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: module, error } = await fetchModuleForAdmin(supabase, moduleId);
  if (error || !module) notFound();

  const { data: progress } = await supabase
    .from("crm_training_progress")
    .select("*")
    .eq("user_id", admin.id)
    .eq("module_id", moduleId)
    .eq("module_version", module.current_version)
    .maybeSingle();

  return (
    <TrainingModuleReader
      module={module}
      progress={(progress as CrmTrainingProgressRow | null) ?? null}
      backHref="/admin/crm/winsalot-training"
      isAdminPreview={!module.is_active}
      markOpenedAction={markModuleOpenedAction}
      markCompleteAction={markModuleCompleteAction}
    />
  );
}
