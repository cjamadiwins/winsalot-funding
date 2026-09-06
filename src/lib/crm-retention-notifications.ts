import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Thin wrapper around the existing, generic crm_notifications table
// (migration 0027) - reused as-is, no new notifications table, per the
// brief's "reuse existing... infrastructure where possible." Dedupes by
// checking for an already-unread notification with the exact same
// (user, title, link_path) before inserting, so a cron run every few
// minutes never piles up duplicate "Follow-up due today" rows for the
// same follow-up while an admin simply hasn't read it yet (brief section
// 11: "Do not send excessive duplicate notifications"). Once the admin
// marks it read, a still-true condition is free to notify again on the
// next sweep - that's intentional (an unread "due today" going unread for
// a week would otherwise never resurface once it's stale).
export async function notifyAdmins(admin: SupabaseClient, input: { title: string; body: string; linkPath: string }): Promise<void> {
  const { data: admins } = await admin.from("crm_users").select("id").eq("role", "admin").eq("active", true);
  if (!admins || admins.length === 0) return;

  for (const row of admins as { id: string }[]) {
    const { data: existing } = await admin
      .from("crm_notifications")
      .select("id")
      .eq("user_id", row.id)
      .eq("link_path", input.linkPath)
      .eq("title", input.title)
      .eq("is_read", false)
      .maybeSingle();
    if (existing) continue;

    await admin.from("crm_notifications").insert({ user_id: row.id, title: input.title, body: input.body, link_path: input.linkPath });
  }
}

// Date-driven admin notifications for the Follow-Up campaign (brief
// section 11: "Follow-up due today" / "Follow-up overdue") - separate
// from runCrmRetentionFollowupsJob's actual send, since a follow-up
// without Auto Send enabled still needs to notify an admin on its due
// date even though nothing is sent automatically. Each follow-up gets its
// own link_path per event (due vs overdue), so a follow-up transitioning
// from "due today" to "overdue" the next day correctly produces one new
// notification rather than none or a duplicate of the first.
export async function sweepRetentionFollowupNotifications(admin: SupabaseClient): Promise<void> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: openFollowups } = await admin
    .from("crm_retention_followups")
    .select("id, client_id, follow_up_date")
    .is("resolved_at", null)
    .is("cancelled_at", null)
    .lte("follow_up_date", todayStr);
  if (!openFollowups || openFollowups.length === 0) return;

  const clientIds = [...new Set((openFollowups as { client_id: string }[]).map((f) => f.client_id))];
  const { data: clients } = await admin.from("crm_clients").select("id, company_name").in("id", clientIds);
  const nameById = new Map(((clients ?? []) as { id: string; company_name: string }[]).map((c) => [c.id, c.company_name]));

  for (const followup of openFollowups as { id: string; client_id: string; follow_up_date: string }[]) {
    const businessName = nameById.get(followup.client_id) ?? "A client";
    const isOverdue = followup.follow_up_date < todayStr;
    await notifyAdmins(admin, {
      title: isOverdue ? "Follow-up overdue" : "Follow-up due today",
      body: `${businessName}'s scheduled follow-up (${followup.follow_up_date}) ${isOverdue ? "is overdue" : "is due today"}.`,
      linkPath: `/admin/crm/retention?followup=${followup.id}&event=${isOverdue ? "overdue" : "due"}`,
    });
  }
}
