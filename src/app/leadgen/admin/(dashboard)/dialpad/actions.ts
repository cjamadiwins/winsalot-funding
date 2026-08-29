"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { importDialpadCsv } from "@/lib/dialpad-report-data";

export async function importLeadDialpadReportAction(_state: { error?: string; success?: string }, formData: FormData) {
  const admin = await requireLeadgenAdmin();
  const result = await importDialpadCsv({
    supabase: await createSupabaseServerClient(),
    workspace: "lead",
    importedById: admin.id,
    importedByName: admin.full_name || admin.email,
    formData,
  });
  revalidatePath("/admin/crm/dialpad");
  revalidatePath("/leadgen/admin/dialpad");
  return result;
}
