import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmUser } from "@/lib/crm-auth";
import type { CrmTrainingMaterialRow } from "@/lib/crm-types";
import TrainingList from "./TrainingList";

export default async function AgentTrainingPage() {
  await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  // RLS (crm_training_materials_select_members) permits any active CRM
  // member - agent or admin - to read every training material.
  const { data: materials, error } = await supabase
    .from("crm_training_materials")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-[var(--color-ink-strong)]">
        Sales Training &amp; Call Scripts
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Reference scripts and training materials. View and copy only — ask your admin for any
        changes.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load training materials: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <TrainingList materials={(materials ?? []) as CrmTrainingMaterialRow[]} />
        </div>
      )}
    </div>
  );
}
