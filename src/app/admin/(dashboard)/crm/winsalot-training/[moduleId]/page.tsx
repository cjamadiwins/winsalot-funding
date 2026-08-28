import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchModuleForAdmin } from "@/lib/crm-training-data";
import TrainingModuleEditorClient from "@/components/crm-training/TrainingModuleEditorClient";
import { updateTrainingModuleAction } from "../actions";

export default async function EditTrainingModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  await requireCrmAdmin();
  const { moduleId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: module, error } = await fetchModuleForAdmin(supabase, moduleId);
  if (error || !module) notFound();

  return <TrainingModuleEditorClient module={module} updateAction={updateTrainingModuleAction} />;
}
