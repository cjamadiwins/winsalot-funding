import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { ScriptNotificationKind } from "./leadgen-script-status";

// Admin notifications for script state changes - reuses the existing
// leadgen_notifications table and NotificationBell exactly as the activity
// alerts do (service-role insert; no insert policy for signed-in users).
// Who/when to send is decided by planScriptStateUpdate() so duplicates are
// suppressed before this is ever called.
const STATUS_ADMIN_PATH = "/leadgen/admin#agent-script-status";

export async function notifyAdminsOfScriptState(input: { kind: ScriptNotificationKind; agentName: string; clientName: string; listName: string }): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: admins, error: adminsError } = await admin.from("leadgen_users").select("id").eq("role", "admin").eq("active", true);
  if (adminsError || !admins?.length) {
    if (adminsError) console.error("[leadgen-script-status] Failed to load admins to notify:", adminsError);
    return;
  }
  const where = `${input.clientName} — ${input.listName}`;
  const title =
    input.kind === "opened"
      ? `${input.agentName} opened the approved call script for ${where}.`
      : `${input.agentName} is working ${where} with the approved call script closed.`;
  const { error } = await admin.from("leadgen_notifications").insert(admins.map((a) => ({ user_id: a.id, title, body: null, link_path: STATUS_ADMIN_PATH })));
  if (error) console.error("[leadgen-script-status] Failed to notify admins:", error);
}
