"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Admin-only edit for leadgen_call_logs.client_visible_note - deliberately
// separate from the agent's "Log a Call" creation flow
// (src/app/leadgen/agent/(dashboard)/call-log/actions.ts), which this never
// touches. Written through the session-scoped client so the existing
// leadgen_call_logs_admin_all RLS policy (migration 0130) is what actually
// authorizes the write, not just this function's own requireLeadgenAdmin() check.
export async function updateCallLogClientVisibleNoteAction(logId: string, note: string): Promise<{ error?: string }> {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const trimmed = note.trim();
  const { error } = await supabase
    .from("leadgen_call_logs")
    .update({ client_visible_note: trimmed || null })
    .eq("id", logId);

  if (error) return { error: "Failed to save the client-visible note." };
  revalidatePath("/leadgen/admin/performance/call-notes");
  return {};
}
