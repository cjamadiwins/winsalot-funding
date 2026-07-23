import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmTrainingMaterialRow } from "@/lib/crm-types";
import TrainingClient from "./TrainingClient";

export default async function AdminCrmTrainingPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: materials, error } = await supabase
    .from("crm_training_materials")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Sales Training &amp; Call Scripts</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage the training materials and call scripts agents see on their own, read-only
        Training page.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load training materials: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <TrainingClient materials={(materials ?? []) as CrmTrainingMaterialRow[]} />
        </div>
      )}
    </div>
  );
}
