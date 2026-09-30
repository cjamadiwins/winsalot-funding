import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { ScriptNotificationKind } from "./leadgen-script-status";

// Admin notifications for Growth script state changes - reuses the existing
// crm_notifications table and NotificationBell (service-role insert; no insert
// policy for signed-in users). Whether to send is decided by
// planScriptStateUpdate() so duplicates are suppressed before this is called.
const STATUS_ADMIN_PATH = "/admin/crm#agent-script-status";

export async function notifyAdminsOfGrowthScriptState(input: { kind: ScriptNotificationKind; agentName: string; serviceLabel: string; listName: string }): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: admins, error: adminsError } = await admin.from("crm_users").select("id").eq("role", "admin").eq("active", true);
  if (adminsError || !admins?.length) {
    if (adminsError) console.error("[growth-script-status] Failed to load admins to notify:", adminsError);
    return;
  }
  const where = `${input.serviceLabel} — ${input.listName}`;
  const title =
    input.kind === "opened"
      ? `${input.agentName} opened the approved call script for ${where}.`
      : `${input.agentName} is working ${where} with the approved call script closed.`;
  const { error } = await admin.from("crm_notifications").insert(admins.map((a) => ({ user_id: a.id, title, body: null, link_path: STATUS_ADMIN_PATH })));
  if (error) console.error("[growth-script-status] Failed to notify admins:", error);
}
