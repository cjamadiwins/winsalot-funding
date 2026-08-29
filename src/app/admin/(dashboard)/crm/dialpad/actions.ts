"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { importDialpadCsv } from "@/lib/dialpad-report-data";

export async function importGrowthDialpadReportAction(_state: { error?: string; success?: string }, formData: FormData) {
  const admin = await requireCrmAdmin();
  const result = await importDialpadCsv({
    supabase: await createSupabaseServerClient(),
    workspace: "growth",
    importedById: admin.id,
    importedByName: admin.full_name || admin.email,
    formData,
  });
  revalidatePath("/admin/crm/dialpad");
  revalidatePath("/leadgen/admin/dialpad");
  return result;
}
