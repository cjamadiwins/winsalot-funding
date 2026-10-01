import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Records an Admin "Preview as Client" open. The admin stays signed in as
// themselves (requireLeadgenAdmin) - they never use or see client
// credentials - and each preview is written to leadgen_portal_preview_audit.
export async function recordPortalPreview(admin: SupabaseClient, input: { adminId: string; clientId: string; appointmentId?: string | null }): Promise<void> {
  const { error } = await admin.from("leadgen_portal_preview_audit").insert({
    admin_id: input.adminId,
    client_id: input.clientId,
    appointment_id: input.appointmentId ?? null,
    action: input.appointmentId ? "preview_appointment_brief" : "preview_portal",
  });
  if (error) console.error("[portal-preview] failed to record audit row:", error.message);
}
