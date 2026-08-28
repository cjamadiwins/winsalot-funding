import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import TrainingModuleReader from "@/components/crm-training/TrainingModuleReader";
import { markModuleCompleteAction, markModuleOpenedAction } from "@/lib/crm-training-actions";
import type { CrmTrainingModuleWithContent, TrainingModuleContent } from "@/lib/crm-training-types";
import { EMPTY_TRAINING_MODULE_CONTENT } from "@/lib/crm-training-types";
import type { CrmTrainingProgressRow } from "@/lib/crm-training-types";

export default async function AgentTrainingModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const user = await requireCrmUser();
  const { moduleId } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS (crm_training_modules_agent_select_assigned) means this simply
  // returns nothing for a module that isn't active and assigned to this
  // agent - "Agents must only see... modules assigned to them."
  const { data: module } = await supabase.from("crm_training_modules").select("*").eq("id", moduleId).maybeSingle();
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
    .eq("user_id", user.id)
    .eq("module_id", moduleId)
    .eq("module_version", module.current_version)
    .maybeSingle();

  return (
    <TrainingModuleReader
      module={moduleWithContent}
      progress={(progress as CrmTrainingProgressRow | null) ?? null}
      backHref="/agent/winsalot-training"
      markOpenedAction={markModuleOpenedAction}
      markCompleteAction={markModuleCompleteAction}
    />
  );
}
