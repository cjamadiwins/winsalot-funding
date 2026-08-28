import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import TrainingModuleReader from "@/components/crm-training/TrainingModuleReader";
import { markModuleCompleteAction, markModuleOpenedAction } from "@/lib/crm-training-actions";
import type { CrmTrainingModuleWithContent, CrmTrainingProgressRow, TrainingModuleContent } from "@/lib/crm-training-types";
import { EMPTY_TRAINING_MODULE_CONTENT } from "@/lib/crm-training-types";

export default async function AdminTrainingLearnModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const admin = await requireCrmAdmin();
  const { moduleId } = await params;
  const supabase = await createSupabaseServerClient();

  // Only active modules here, mirroring the agent experience exactly -
  // draft-preview (any module, active or not) lives at the separate
  // /admin/crm/winsalot-training/[moduleId]/read route instead.
  const { data: module } = await supabase.from("crm_training_modules").select("*").eq("id", moduleId).eq("is_active", true).maybeSingle();
  if (!module) notFound();

  const { data: version } = await supabase
    .from("crm_training_module_versions")
    .select("*")
    .eq("module_id", moduleId)
    .eq("version", module.current_version)
    .maybeSingle();

  const moduleWithContent: CrmTrainingModuleWithContent = {
    ...module,
    content: (version?.content as TrainingModuleContent) ?? EMPTY_TRAINING_MODULE_CONTENT,
  };

  const { data: progress } = await supabase
    .from("crm_training_progress")
    .select("*")
    .eq("user_id", admin.id)
    .eq("module_id", moduleId)
    .eq("module_version", module.current_version)
    .maybeSingle();

  return (
    <TrainingModuleReader
      module={moduleWithContent}
      progress={(progress as CrmTrainingProgressRow | null) ?? null}
      backHref="/admin/crm/winsalot-training/learn"
      markOpenedAction={markModuleOpenedAction}
      markCompleteAction={markModuleCompleteAction}
    />
  );
}
