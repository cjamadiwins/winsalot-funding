"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// Deletes a quote_requests row outright. provider_quote_tokens,
// provider_quote_submissions, and customer_quote_tokens all declare
// `on delete cascade` against quote_requests.id (see migrations 0004 and
// 0006), so the database removes every related provider quote, customer
// response, and quote link itself — no orphaned rows are left behind.
export async function deleteQuoteRequestAction(requestId: string) {
  await requireAdminUser();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("quote_requests").delete().eq("id", requestId);

  if (error) throw new Error("Failed to delete the quote request.");

  revalidatePath("/admin");
}

export async function deleteQuoteRequestsAction(requestIds: string[]) {
  await requireAdminUser();

  if (requestIds.length === 0) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("quote_requests").delete().in("id", requestIds);

  if (error) throw new Error("Failed to delete the selected quote requests.");

  revalidatePath("/admin");
}
