"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResendClient } from "@/lib/resend";
import { getEmailReplyTo, getEmailSender } from "@/lib/email-senders";
import { loadReceiptByPaymentId } from "@/lib/crm-receipt";
import { renderReceiptPdfBuffer } from "@/lib/crm-receipt-pdf";
import { renderReceiptEmail } from "@/lib/crm-receipt-email";

type ActionResult = { error?: string; sentTo?: string };

// Email Receipt / Resend Receipt - one action; a second send just bumps
// receipt_email_count (the UI asks for confirmation first). Sends the
// branded HTML receipt plus the PDF, from the Winsalot Billing identity.
export async function emailPaymentReceiptAction(paymentId: string, to: string): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const recipient = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return { error: "Enter a valid recipient email address." };

  const receipt = await loadReceiptByPaymentId(supabase, paymentId);
  if (!receipt) return { error: "Receipt not found for this payment." };
  if (receipt.status !== "PAID") return { error: "A reversed payment cannot be receipted." };

  const email = renderReceiptEmail(receipt);
  const pdf = await renderReceiptPdfBuffer(receipt);
  const { data: sent, error: sendError } = await getResendClient().emails.send({
    from: getEmailSender("billing"),
    to: recipient,
    replyTo: getEmailReplyTo(),
    subject: email.subject,
    text: email.text,
    html: email.html,
    attachments: [{ filename: `Winsalot-Receipt-${receipt.receiptNumber}.pdf`, content: pdf }],
  });
  if (sendError || !sent) return { error: `Failed to send the receipt: ${sendError?.message ?? "Unknown email error."}` };

  const db = getSupabaseAdmin();
  const { data: current } = await db.from("crm_payments").select("client_id, receipt_email_count").eq("id", paymentId).maybeSingle();
  await db
    .from("crm_payments")
    .update({ receipt_last_emailed_at: new Date().toISOString(), receipt_last_emailed_to: recipient, receipt_email_count: (current?.receipt_email_count ?? 0) + 1 })
    .eq("id", paymentId);

  if (current?.client_id) {
    await supabase.from("crm_activities").insert({
      client_id: current.client_id,
      agent_id: admin.id,
      activity_type: "note",
      notes: `Payment receipt ${receipt.receiptNumber} (${receipt.amountLabel}) emailed to ${recipient} by ${admin.full_name || admin.email}.`,
    });
    revalidatePath(`/admin/crm/clients/${current.client_id}`);
  }
  revalidatePath(`/admin/crm/payments/${paymentId}/receipt`);
  return { sentTo: recipient };
}
