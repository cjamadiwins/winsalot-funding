import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { SubcontractorTrainingModuleRow, SubcontractorTrainingProgressRow } from "@/lib/crm-subcontractor-types";
import { updateOwnTrainingProgressAction } from "@/lib/crm-subcontractor-actions";
import TrainingClient from "./TrainingClient";

export default async function SubcontractorTrainingPage() {
  const crmUser = await requireCrmSubcontractor();
  const subcontractorId = crmUser.subcontractor_id as string;
  const supabase = await createSupabaseServerClient();

  const [{ data: modules }, { data: progress }] = await Promise.all([
    supabase.from("crm_subcontractor_training_modules").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("crm_subcontractor_training_progress").select("*").eq("subcontractor_id", subcontractorId),
  ]);

  return (
    <TrainingClient
      modules={(modules ?? []) as SubcontractorTrainingModuleRow[]}
      progress={(progress ?? []) as SubcontractorTrainingProgressRow[]}
      updateProgressAction={updateOwnTrainingProgressAction}
    />
  );
}
