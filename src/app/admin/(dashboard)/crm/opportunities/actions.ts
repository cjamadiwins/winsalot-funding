"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { runOpportunityCollection, type CollectionSummary } from "@/lib/opportunities/run";
import { OPPORTUNITY_STATUSES, type OpportunityStatus } from "@/lib/opportunities/types";

// Every action returns { error } instead of throwing - same rationale as
// the rest of the CRM's admin actions (see crm/agents/actions.ts): Next.js
// redacts a thrown Server Action error down to a generic message in
// production, which would swallow our own deliberate ones too.
type ActionResult = { error?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

export async function updateOpportunityFieldsAction(id: string, formData: FormData): Promise<ActionResult> {
  await requireCrmAdmin();
  const opportunityTitle = String(formData.get("opportunity_title") ?? "").trim();
  if (!opportunityTitle) return { error: "Opportunity title is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("active_cleaning_opportunities")
    .update({
      organization_name: textOrNull(formData, "organization_name"),
      opportunity_title: opportunityTitle,
      description: textOrNull(formData, "description"),
      service_needed: textOrNull(formData, "service_needed"),
      industry: textOrNull(formData, "industry"),
      city: textOrNull(formData, "city"),
      province: textOrNull(formData, "province"),
      address: textOrNull(formData, "address"),
      contact_name: textOrNull(formData, "contact_name"),
      public_email: textOrNull(formData, "public_email"),
      public_phone: textOrNull(formData, "public_phone"),
      website: textOrNull(formData, "website"),
      deadline: textOrNull(formData, "deadline"),
      notes: textOrNull(formData, "notes"),
    })
    .eq("id", id);

  if (error) return { error: "Failed to save the opportunity." };

  revalidatePath("/admin/crm/opportunities");
  revalidatePath(`/admin/crm/opportunities/${id}`);
  return {};
}

export async function updateOpportunityStatusAction(
  id: string,
  status: OpportunityStatus
): Promise<ActionResult> {
  await requireCrmAdmin();
  if (!OPPORTUNITY_STATUSES.includes(status)) return { error: "Invalid status." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("active_cleaning_opportunities").update({ status }).eq("id", id);
  if (error) return { error: "Failed to update status." };

  revalidatePath("/admin/crm/opportunities");
  revalidatePath(`/admin/crm/opportunities/${id}`);
  return {};
}

// Assigning (or reassigning) always goes through here - the UI shows the
// current assignment before this is called so an admin reassigning an
// already-assigned opportunity does so knowingly, per "clearly show when
// an opportunity is already assigned."
export async function assignOpportunityAgentAction(
  id: string,
  agentId: string | null
): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const update: { assigned_agent: string | null; status?: OpportunityStatus } = { assigned_agent: agentId };
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

  revalidatePath("/admin/crm/opportunities");
  revalidatePath(`/admin/crm/opportunities/${id}`);
  return {};
}

export async function archiveOpportunityAction(id: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("active_cleaning_opportunities")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.id })
    .eq("id", id);
  if (error) return { error: "Failed to archive the opportunity." };

  revalidatePath("/admin/crm/opportunities");
  revalidatePath(`/admin/crm/opportunities/${id}`);
  return {};
}

export async function restoreOpportunityAction(id: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("active_cleaning_opportunities")
    .update({ archived_at: null, archived_by: null })
    .eq("id", id);
  if (error) return { error: "Failed to restore the opportunity." };

  revalidatePath("/admin/crm/opportunities");
  revalidatePath(`/admin/crm/opportunities/${id}`);
  return {};
}

// Permanent, irreversible - the caller (OpportunitiesAdminClient) requires
// a confirmation dialog before calling this. crm_activities/crm_followups
// rows for this opportunity cascade-delete with it (on delete cascade);
// the audit log's own DELETE-branch entry survives (opportunity_id set
// null, title snapshot kept) - see migration 0012.
export async function deleteOpportunityAction(id: string): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("active_cleaning_opportunities").delete().eq("id", id);
  if (error) return { error: "Failed to permanently delete the opportunity." };

  revalidatePath("/admin/crm/opportunities");
  return {};
}

export async function bulkArchiveOpportunitiesAction(ids: string[]): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  if (ids.length === 0) return { error: "No opportunities selected." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("active_cleaning_opportunities")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.id })
    .in("id", ids);
  if (error) return { error: "Failed to archive the selected opportunities." };

  revalidatePath("/admin/crm/opportunities");
  return {};
}

export async function bulkDeleteOpportunitiesAction(ids: string[]): Promise<ActionResult> {
  await requireCrmAdmin();
  if (ids.length === 0) return { error: "No opportunities selected." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("active_cleaning_opportunities").delete().in("id", ids);
  if (error) return { error: "Failed to permanently delete the selected opportunities." };

  revalidatePath("/admin/crm/opportunities");
  return {};
}

// Merges one or more duplicate records into a primary one: every note,
// call, and scheduled follow-up on a duplicate is moved onto the primary
// (so nothing an agent already logged is lost), then the duplicates are
// archived (not hard-deleted) so an admin can still review or permanently
// delete them afterward. Uses the service-role client because
// active_cleaning_opportunities_audit_log has no insert policy for any
// session-scoped role (see migration 0012) - only the row trigger and this
// kind of explicit system write are allowed to add audit entries.
export async function mergeOpportunitiesAction(
  primaryId: string,
  duplicateIds: string[]
): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const ids = duplicateIds.filter((id) => id !== primaryId);
  if (ids.length === 0) return { error: "Select at least one duplicate to merge into the primary record." };

  const supabase = await createSupabaseServerClient();
  const serviceClient = getSupabaseAdmin();

  const { data: primary, error: primaryError } = await supabase
    .from("active_cleaning_opportunities")
    .select("id, opportunity_title")
    .eq("id", primaryId)
    .maybeSingle();
  if (primaryError || !primary) return { error: "Primary record not found." };

  const { data: duplicates, error: duplicatesError } = await supabase
    .from("active_cleaning_opportunities")
    .select("id, opportunity_title")
    .in("id", ids);
  if (duplicatesError || !duplicates || duplicates.length !== ids.length) {
    return { error: "One or more duplicate records not found." };
  }

  const [{ error: activitiesError }, { error: followUpsError }] = await Promise.all([
    supabase.from("crm_activities").update({ opportunity_id: primaryId }).in("opportunity_id", ids),
    supabase.from("crm_followups").update({ opportunity_id: primaryId }).in("opportunity_id", ids),
  ]);
  if (activitiesError || followUpsError) {
    return { error: "Failed to move notes/follow-ups from the duplicates onto the primary record." };
  }

  const { error: archiveError } = await supabase
    .from("active_cleaning_opportunities")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.id })
    .in("id", ids);
  if (archiveError) return { error: "Duplicates' history was moved, but archiving them failed." };

  const auditRows = [primary, ...duplicates].map((row) => ({
    opportunity_id: row.id,
    opportunity_title_snapshot: row.opportunity_title,
    actor_id: admin.id,
    action: "merged" as const,
    details:
      row.id === primaryId
        ? `Merged ${duplicates.length} duplicate(s) into this record: ${duplicates.map((d) => d.opportunity_title).join(", ")}`
        : `Merged into "${primary.opportunity_title}" and archived.`,
  }));
  await serviceClient.from("active_cleaning_opportunities_audit_log").insert(auditRows);

  revalidatePath("/admin/crm/opportunities");
  revalidatePath(`/admin/crm/opportunities/${primaryId}`);
  return {};
}

export async function addOpportunityActivityAction(id: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const activityType = String(formData.get("activity_type") ?? "note").trim();
  const notes = textOrNull(formData, "notes");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "").trim();
  const nextFollowUpAt = nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null;

  const { error: activityError } = await supabase.from("crm_activities").insert({
    opportunity_id: id,
    agent_id: crmUser.id,
    activity_type: activityType,
    notes,
    next_follow_up_at: nextFollowUpAt,
  });
  if (activityError) return { error: "Failed to save the note." };

  if (nextFollowUpAt) {
    const { error: followUpError } = await supabase.from("crm_followups").insert({
      opportunity_id: id,
      scheduled_by: crmUser.id,
      scheduled_at: nextFollowUpAt,
    });
    if (followUpError) return { error: "Note saved, but failed to schedule the follow-up." };
  }

  const { error: lastContactedError } = await supabase
    .from("active_cleaning_opportunities")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", id);
  if (lastContactedError) return { error: "Note saved, but failed to update the last-contacted date." };

  revalidatePath(`/admin/crm/opportunities/${id}`);
  return {};
}

function parseScheduledAt(formData: FormData): string {
  const raw = String(formData.get("scheduled_at") ?? "").trim();
  if (!raw) throw new Error("A callback date and time is required.");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date/time.");
  return date.toISOString();
}

export async function scheduleOpportunityFollowUpAction(id: string, formData: FormData): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  let scheduledAt: string;
  try {
    scheduledAt = parseScheduledAt(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid date/time." };
  }

  const { error } = await supabase.from("crm_followups").insert({
    opportunity_id: id,
    scheduled_by: crmUser.id,
    scheduled_at: scheduledAt,
    note: textOrNull(formData, "note"),
  });
  if (error) return { error: "Failed to schedule the callback." };

  revalidatePath(`/admin/crm/opportunities/${id}`);
  return {};
}

export async function rescheduleOpportunityFollowUpAction(
  followUpId: string,
  opportunityId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  let scheduledAt: string;
  try {
    scheduledAt = parseScheduledAt(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid date/time." };
  }

  const { error } = await supabase
    .from("crm_followups")
    .update({ scheduled_at: scheduledAt, note: textOrNull(formData, "note"), status: "pending", completed_at: null, completed_by: null })
    .eq("id", followUpId);
  if (error) return { error: "Failed to reschedule the callback." };

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  return {};
}

export async function completeOpportunityFollowUpAction(
  followUpId: string,
  opportunityId: string
): Promise<ActionResult> {
  const crmUser = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("crm_followups")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: crmUser.id })
    .eq("id", followUpId);
  if (error) return { error: "Failed to mark the callback completed." };

  revalidatePath(`/admin/crm/opportunities/${opportunityId}`);
  return {};
}

// Manual trigger for the same daily collection job the (currently
// disabled) cron route runs.
export async function runCollectionNowAction(
  skipHotAlertEmails: boolean
): Promise<ActionResult & { summary?: CollectionSummary }> {
  await requireCrmAdmin();
  try {
    const summary = await runOpportunityCollection({ skipHotAlertEmails });
    revalidatePath("/admin/crm/opportunities");
    return { summary };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to run collection." };
  }
}
