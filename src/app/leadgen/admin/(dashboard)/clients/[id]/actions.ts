"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendLeadgenEmail } from "@/lib/leadgen-email";
import { isValidEmail } from "@/lib/leadgen-types";

type ActionResult = { error?: string };

// Direct client email (brief section "DIRECT CLIENT EMAIL FROM THE
// CRM") - admin-only. lead_id is always null on the resulting row,
// which is exactly what marks it as a client-facing communication
// rather than a prospect email (see leadgen_emails RLS in the schema
// comment). Always client-visible, since the whole point is the client
// seeing it in their Communications view.
export async function sendClientCommunicationAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireLeadgenAdmin();

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const campaignId = String(formData.get("campaign_id") ?? "").trim() || null;
  const templateKey = String(formData.get("template_key") ?? "").trim() || null;

  if (!toEmail || !isValidEmail(toEmail)) return { error: "Enter a valid recipient email address." };
  if (!subject) return { error: "A subject is required." };
  if (!body) return { error: "An email body is required." };

  const supabase = await createSupabaseServerClient();
  const result = await sendLeadgenEmail(supabase, {
    clientId,
    campaignId,
    templateKey,
    toEmail,
    subject,
    body,
    sentBy: admin.id,
    clientVisible: true,
  });

  if (result.error) return { error: result.error };

  revalidatePath(`/leadgen/admin/clients/${clientId}`);
  return {};
}
