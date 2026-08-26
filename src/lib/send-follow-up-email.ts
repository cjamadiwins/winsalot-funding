import "server-only";
import { createSupabaseServerClient } from "./supabase-server";
import { buildFollowUpEmailHtml, buildFollowUpEmailText } from "./follow-up-email";
import { sendTrackedCrmEmail } from "./send-crm-email";
import type { CrmUserRow } from "./crm-types";

// Shared by both the admin (/admin/crm/opportunities/[id]) and agent
// (/agent/opportunities/[id]) "Send Follow-Up Email" actions - same
// tracking, same RLS-backed opportunity scoping, for a prospect who
// hasn't responded yet.
export async function sendFollowUpEmailForOpportunity(
  opportunityId: string,
  crmUser: CrmUserRow
): Promise<{ email: string }> {
  const supabase = await createSupabaseServerClient();

  return sendTrackedCrmEmail(supabase, {
    opportunityId,
    crmUser,
    emailType: "follow_up",
    subject: "Following Up — Winsalot Corp",
    buildText: buildFollowUpEmailText,
    buildHtml: buildFollowUpEmailHtml,
    activityNotePrefix: "Follow-up email",
    noEmailMessage: "This opportunity has no email address on file — the follow-up email can't be sent.",
  });
}
