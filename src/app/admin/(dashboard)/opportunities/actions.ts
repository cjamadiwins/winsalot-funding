"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/admin-auth";
import { runOpportunityCollection, type CollectionSummary } from "@/lib/opportunities/run";
import { OPPORTUNITY_STATUSES, type OpportunityStatus } from "@/lib/opportunities/types";

// Every action below returns { error } instead of throwing - same
// rationale as the CRM's agents/actions.ts: Next.js redacts a thrown
// Server Action error down to a generic message in production, which
// swallows our own deliberate ones too.
type ActionResult = { error?: string };

export async function updateOpportunityStatusAction(
  id: string,
  status: OpportunityStatus
): Promise<ActionResult> {
  await requireAdminUser();
  if (!OPPORTUNITY_STATUSES.includes(status)) {
    return { error: "Invalid status." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("active_cleaning_opportunities").update({ status }).eq("id", id);
  if (error) return { error: "Failed to update status." };

  revalidatePath("/admin/opportunities");
  return {};
}

export async function assignOpportunityAgentAction(
  id: string,
  agentId: string | null
): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createSupabaseServerClient();

  const update: { assigned_agent: string | null; status?: OpportunityStatus } = { assigned_agent: agentId };

  // Only promotes status forward (New/Reviewing -> Assigned) - never
  // regresses a record an admin has already moved further along the
  // pipeline just because it's being reassigned to a different agent.
  if (agentId) {
    const { data: current } = await supabase
      .from("active_cleaning_opportunities")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (current && (current.status === "New" || current.status === "Reviewing")) {
      update.status = "Assigned";
    }
  }

  const { error } = await supabase.from("active_cleaning_opportunities").update(update).eq("id", id);
  if (error) return { error: "Failed to assign agent." };

  revalidatePath("/admin/opportunities");
  return {};
}

export async function addOpportunityNoteAction(id: string, note: string): Promise<ActionResult> {
  const admin = await requireAdminUser();
  const trimmed = note.trim();
  if (!trimmed) return { error: "Note can't be empty." };

  const supabase = await createSupabaseServerClient();
  const { data: current, error: fetchError } = await supabase
    .from("active_cleaning_opportunities")
    .select("notes")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !current) return { error: "Opportunity not found." };

  const entry = `[${new Date().toLocaleString()} - ${admin.email ?? "Admin"}] ${trimmed}`;
  const updatedNotes = current.notes ? `${current.notes}\n\n${entry}` : entry;

  const { error } = await supabase
    .from("active_cleaning_opportunities")
    .update({ notes: updatedNotes })
    .eq("id", id);
  if (error) return { error: "Failed to save note." };

  revalidatePath("/admin/opportunities");
  return {};
}

// Manual trigger for the same collection job the (currently disabled)
// daily cron route runs - lets an admin smoke-test or force-refresh
// connectors without waiting for a schedule to be turned on.
export async function runCollectionNowAction(): Promise<ActionResult & { summary?: CollectionSummary }> {
  await requireAdminUser();
  try {
    const summary = await runOpportunityCollection();
    revalidatePath("/admin/opportunities");
    return { summary };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to run collection." };
  }
}
