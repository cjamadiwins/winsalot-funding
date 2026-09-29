"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidEmail } from "@/lib/leadgen-types";
import { renderClientUpdateEmail } from "@/lib/crm-client-update-email";
import { renderReceiptPdfBuffer } from "@/lib/crm-receipt-pdf";
import { loadReceiptByPaymentId } from "@/lib/crm-receipt";
import {
  getClientCommunicationContent,
  loadResendableCommunication,
  sendAndLogClientEmail,
  type ClientCommType,
  type CommunicationContent,
} from "@/lib/crm-client-communications";

type ActionResult = { error?: string; warning?: string };

function adminName(admin: { full_name: string | null; email: string }): string {
  return admin.full_name || admin.email;
}

// "Send Client Update": Admin composes an important update from the client's
// own record; the FINAL sent version (subject + body) is logged to
// Communication History automatically. `template` only marks the type -
// campaign_setup is the "Your Winsalot Corp. Campaign Setup Is Complete" email.
export async function sendClientUpdateAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const db = getSupabaseAdmin();

  const { data: client } = await db.from("crm_clients").select("id, company_name").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Client not found." };

  const toEmail = String(formData.get("to_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const template = String(formData.get("template") ?? "update");
  const allowDuplicate = String(formData.get("allow_duplicate") ?? "") === "yes";
  const emailType: ClientCommType = template === "campaign_setup" ? "campaign_setup" : "client_update";

  if (!toEmail || !isValidEmail(toEmail)) return { error: "Enter a valid recipient email address." };
  if (!subject) return { error: "A subject is required." };
  if (!message) return { error: "A message is required." };

  // The setup email is a one-time milestone email: don't let it go out twice
  // by accident (Admin can still confirm a deliberate re-send).
  if (emailType === "campaign_setup" && !allowDuplicate) {
    const { data: existing } = await db
      .from("crm_client_communications")
      .select("sent_at, recipient_email")
      .eq("client_id", clientId)
      .eq("email_type", "campaign_setup")
      .neq("status", "failed")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return { error: `A campaign setup email was already sent to ${existing.recipient_email} on ${new Date(existing.sent_at).toLocaleString()}. Tick "Send again anyway" to send another.` };
    }
  }

  const email = renderClientUpdateEmail(subject, message);
  const result = await sendAndLogClientEmail({
    clientId,
    toEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
    emailType,
    senderCategory: "growth",
    sentBy: { id: admin.id, name: adminName(admin) },
  });
  if (!result.ok) return { error: result.error };

  await db.from("crm_activities").insert({
    client_id: clientId,
    agent_id: admin.id,
    activity_type: "note",
    notes: `${emailType === "campaign_setup" ? "Campaign setup email" : "Client update"} "${subject}" emailed to ${toEmail} by ${adminName(admin)}.`,
  });

  revalidatePath(`/admin/crm/clients/${clientId}`);
  return result.logWarning ? { warning: result.logWarning } : {};
}

// Resend a stored email. Always requires an explicit `confirmed` from the UI
// (a second copy reaches the client's inbox), only the types in
// RESENDABLE_CLIENT_COMM_TYPES are allowed, and the resend is logged as its
// own record linked to the original.
export async function resendClientCommunicationAction(clientId: string, communicationId: string, confirmed: boolean): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  if (!confirmed) return { error: "Confirm that you want to send this email again." };

  const original = await loadResendableCommunication(clientId, communicationId);
  if (!original) return { error: "This email can't be re-sent from here." };

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (original.email_type === "payment_receipt" && original.related_type === "payment" && original.related_id) {
    const receipt = await loadReceiptByPaymentId(getSupabaseAdmin(), original.related_id as string);
    if (!receipt || receipt.status !== "PAID") return { error: "This receipt's payment is no longer active, so it can't be re-sent." };
    attachments = [{ filename: `Winsalot-Receipt-${receipt.receiptNumber}.pdf`, content: await renderReceiptPdfBuffer(receipt) }];
  }

  const result = await sendAndLogClientEmail({
    clientId,
    toEmail: original.recipient_email,
    subject: original.subject,
    text: original.body_text ?? "",
    html: original.body_html ?? `<pre>${original.body_text ?? ""}</pre>`,
    emailType: original.email_type as ClientCommType,
    senderCategory: original.email_type === "payment_receipt" ? "billing" : "growth",
    sentBy: { id: admin.id, name: adminName(admin) },
    related: original.related_type && original.related_id ? { type: original.related_type, id: original.related_id as string } : null,
    resentFromId: original.id as string,
    attachments,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/admin/crm/clients/${clientId}`);
  return result.logWarning ? { warning: result.logWarning } : {};
}

// "View Email": returns the stored content on demand.
export async function getClientCommunicationContentAction(clientId: string, source: string, id: string): Promise<{ content?: CommunicationContent; error?: string }> {
  await requireCrmAdmin();
  const content = await getClientCommunicationContent(clientId, source, id);
  if (!content) return { error: "The content of this email isn't stored, or it doesn't belong to this client." };
  return { content };
}
