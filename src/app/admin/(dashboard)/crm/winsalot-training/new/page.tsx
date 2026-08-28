import { requireCrmAdmin } from "@/lib/crm-auth";
import TrainingModuleEditorClient from "@/components/crm-training/TrainingModuleEditorClient";
import { createTrainingModuleAction } from "../actions";

export default async function NewTrainingModulePage() {
  await requireCrmAdmin();
  return <TrainingModuleEditorClient createAction={createTrainingModuleAction} />;
}
