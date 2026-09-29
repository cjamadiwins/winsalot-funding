import "server-only";
import { getResendClient } from "./resend";
import { getEmailReplyTo, getEmailSender, type EmailCategory } from "./email-senders";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  CLIENT_COMM_TYPE_LABELS,
  RESENDABLE_CLIENT_COMM_TYPES,
  categorizeInvoiceEmail,
  categorizeLeadEmail,
  categorizeLeadgenEmail,
  redactSecureLinks,
  sortCommunications,
  type ClientCommunicationEntry,
  type CommunicationRelated,
} from "./crm-client-communications-shared";

// Client Communication History (Growth CRM client profile).
//
//  - crm_client_communications (new) logs the client emails that had no log:
//    receipts, agreement/intake emails, manual updates, the setup email.
//  - Everything already logged elsewhere is READ THROUGH, never copied, so an
//    email can only ever appear once: leadgen_emails (portal invites/resets,
//    campaign reports, client communications), crm_invoice_emails,
//    crm_retention_emails, crm_lead_emails (the client's earlier
//    consultation/appointment emails).

export type ClientCommType = "payment_receipt" | "agreement_sent" | "agreement_signed_copy" | "intake_form" | "client_update" | "campaign_setup";

export type LogClientCommunicationInput = {
  clientId: string;
  toEmail: string;
  subject: string;
  emailType: ClientCommType;
  sender: string;
  sentBy: { id: string | null; name: string } | null;
  html?: string | null;
  text?: string | null;
  resendEmailId: string | null;
  status?: "sent" | "failed";
  errorDetail?: string | null;
  related?: { type: NonNullable<CommunicationRelated["type"]>; id: string } | null;
  resentFromId?: string | null;
  sentAt?: string;
};

// Inserts one log row. resend_email_id is unique, so logging the same send
// twice (a retry, a double-click) is a no-op that returns the existing id.
export async function logClientCommunication(input: LogClientCommunicationInput): Promise<{ id: string | null; error?: string }> {
  const admin = getSupabaseAdmin();
  const now = input.sentAt ?? new Date().toISOString();
  const row = {
    client_id: input.clientId,
    recipient_email: input.toEmail,
    subject: input.subject,
    email_type: input.emailType,
    sender: input.sender,
    sent_by_user_id: input.sentBy?.id ?? null,
    sent_by_name: input.sentBy?.name ?? null,
    sent_at: now,
    body_html: input.html ?? null,
    body_text: input.text ?? null,
    status: input.status ?? "sent",
    status_at: now,
    failed_at: input.status === "failed" ? now : null,
    error_detail: input.errorDetail ?? null,
    resend_email_id: input.resendEmailId,
    related_type: input.related?.type ?? null,
    related_id: input.related?.id ?? null,
    resent_from_id: input.resentFromId ?? null,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from("crm_client_communications")
      .upsert(row, { onConflict: "resend_email_id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (!error) {
      if (data?.id) return { id: data.id as string };
      // Ignored as a duplicate: return the record that already exists.
      if (input.resendEmailId) {
        const { data: existing } = await admin.from("crm_client_communications").select("id").eq("resend_email_id", input.resendEmailId).maybeSingle();
        return { id: (existing?.id as string | undefined) ?? null };
      }
      return { id: null };
    }
    if (attempt === 1) return { id: null, error: error.message };
  }
  return { id: null };
}

export type SendClientEmailInput = {
  clientId: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  emailType: ClientCommType;
  senderCategory?: EmailCategory;
  sentBy: { id: string | null; name: string } | null;
  related?: LogClientCommunicationInput["related"];
  resentFromId?: string | null;
  attachments?: { filename: string; content: Buffer }[];
};

export type SendClientEmailResult = { ok: boolean; communicationId?: string | null; resendEmailId?: string; error?: string; logWarning?: string };

// Sends through Resend and logs the FINAL sent version. A failed send is
// logged too (status "failed") so an attempted client email is never silently
// lost; if the send worked but the log write fails twice, the caller is told
// (logWarning) instead of the email being reported as failed.
export async function sendAndLogClientEmail(input: SendClientEmailInput): Promise<SendClientEmailResult> {
  const sender = getEmailSender(input.senderCategory ?? "growth");
  let resendId: string | null = null;
  let sendError: string | null = null;
  try {
    const { data, error } = await getResendClient().emails.send({
      from: sender,
      to: input.toEmail,
      replyTo: getEmailReplyTo(),
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.attachments ? { attachments: input.attachments } : {}),
    });
    if (error || !data) sendError = error?.message ?? "Unknown email error.";
    else resendId = data.id;
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Unknown email error.";
  }

  const common = {
    clientId: input.clientId,
    toEmail: input.toEmail,
    subject: input.subject,
    emailType: input.emailType,
    sender,
    sentBy: input.sentBy,
    html: input.html,
    text: input.text,
    related: input.related ?? null,
    resentFromId: input.resentFromId ?? null,
  };

  if (sendError || !resendId) {
    await logClientCommunication({ ...common, resendEmailId: null, status: "failed", errorDetail: sendError });
    return { ok: false, error: `Failed to send the email: ${sendError}` };
  }

  const logged = await logClientCommunication({ ...common, resendEmailId: resendId });
  if (logged.error) return { ok: true, resendEmailId: resendId, logWarning: `The email was sent, but it could not be saved to Communication History: ${logged.error}` };
  return { ok: true, communicationId: logged.id, resendEmailId: resendId };
}

const ROW_LIMIT = 200;

export async function listClientCommunications(clientId: string): Promise<ClientCommunicationEntry[]> {
  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("crm_clients").select("id, leadgen_client_id").eq("id", clientId).maybeSingle();
  if (!client) return [];

  const [{ data: own }, { data: invoices }, { data: retention }, { data: agreements }] = await Promise.all([
    admin.from("crm_client_communications").select("*").eq("client_id", clientId).order("sent_at", { ascending: false }).limit(ROW_LIMIT),
    admin.from("crm_invoices").select("id, invoice_number").eq("client_id", clientId),
    admin.from("crm_retention_emails").select("id, to_email, subject, status, sent_at, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(ROW_LIMIT),
    admin.from("crm_client_agreements").select("id, opportunity_id").eq("client_id", clientId),
  ]);

  const invoiceIds = (invoices ?? []).map((i) => i.id as string);
  const invoiceNumberById = new Map((invoices ?? []).map((i) => [i.id as string, i.invoice_number as string]));
  const opportunityIds = [...new Set((agreements ?? []).map((a) => a.opportunity_id as string | null).filter((id): id is string => !!id))];

  const [{ data: leadgenEmails }, { data: invoiceEmails }, { data: leadEmails }] = await Promise.all([
    client.leadgen_client_id
      ? admin
          .from("leadgen_emails")
          .select("id, created_at, to_email, subject, template_key, sender_email, status, sent_at")
          .eq("client_id", client.leadgen_client_id)
          .is("lead_id", null)
          .order("created_at", { ascending: false })
          .limit(ROW_LIMIT)
      : Promise.resolve({ data: [] as never[] }),
    invoiceIds.length
      ? admin.from("crm_invoice_emails").select("id, invoice_id, email_type, to_email, status, sent_at, created_at").in("invoice_id", invoiceIds).order("created_at", { ascending: false }).limit(ROW_LIMIT)
      : Promise.resolve({ data: [] as never[] }),
    opportunityIds.length
      ? admin.from("crm_lead_emails").select("id, email_type, to_email, subject, status, sent_at, created_at").in("opportunity_id", opportunityIds).order("created_at", { ascending: false }).limit(ROW_LIMIT)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const growthSender = getEmailSender("growth");
  const billingSender = getEmailSender("billing");
  const entries: ClientCommunicationEntry[] = [];

  for (const row of own ?? []) {
    const type = row.email_type as string;
    const relatedType = row.related_type as CommunicationRelated["type"] | null;
    let related: CommunicationRelated | null = null;
    if (relatedType && row.related_id) {
      const href = relatedType === "payment" ? `/admin/crm/payments/${row.related_id}/receipt` : relatedType === "agreement" ? `/admin/crm/agreements/${row.related_id}` : null;
      related = { type: relatedType, label: relatedType === "payment" ? "Payment receipt" : relatedType === "agreement" ? "Agreement" : relatedType, href };
    }
    const resendable = RESENDABLE_CLIENT_COMM_TYPES.has(type) && row.status !== "failed";
    entries.push({
      key: `client_comm:${row.id}`,
      source: "client_comm",
      id: row.id as string,
      sentAt: row.sent_at as string,
      recipient: row.recipient_email as string,
      subject: row.subject as string,
      category: CLIENT_COMM_TYPE_LABELS[type] ?? "Other",
      sender: `${row.sender as string}${row.sent_by_name ? ` (sent by ${row.sent_by_name})` : ""}`,
      status: row.status as string,
      related,
      hasContent: !!(row.body_html || row.body_text),
      canResend: resendable,
      resendNote: resendable ? null : type.startsWith("agreement") || type === "intake_form" ? "Use the agreement/intake workflow (it carries a one-time secure link)." : null,
    });
  }

  for (const row of leadgenEmails ?? []) {
    const r = row as { id: string; created_at: string; to_email: string; subject: string; template_key: string | null; sender_email: string | null; status: string; sent_at: string | null };
    const category = categorizeLeadgenEmail(r.template_key, r.subject);
    entries.push({
      key: `leadgen_email:${r.id}`,
      source: "leadgen_email",
      id: r.id,
      sentAt: r.sent_at ?? r.created_at,
      recipient: r.to_email,
      subject: r.subject,
      category,
      sender: r.sender_email ?? "Winsalot Corp.",
      status: r.status,
      related: category === "Campaign report" ? { type: "report", label: "Campaign report", href: null } : category === "Client portal invitation" ? { type: "portal", label: "Client portal", href: null } : null,
      hasContent: true,
      canResend: false,
      resendNote: category === "Client portal invitation" ? "Use Resend invitation in Client Portal Access (it issues a fresh secure link)." : "Use the original workflow to send again.",
    });
  }

  for (const row of invoiceEmails ?? []) {
    const r = row as { id: string; invoice_id: string; email_type: string; to_email: string; status: string; sent_at: string | null; created_at: string };
    const number = invoiceNumberById.get(r.invoice_id) ?? "invoice";
    const receipt = r.email_type === "invoice_receipt";
    entries.push({
      key: `invoice_email:${r.id}`,
      source: "invoice_email",
      id: r.id,
      sentAt: r.sent_at ?? r.created_at,
      recipient: r.to_email,
      subject: receipt ? `Payment receipt for ${number}` : r.email_type === "invoice_reminder" ? `Payment reminder for ${number}` : `Invoice ${number}`,
      category: categorizeInvoiceEmail(r.email_type),
      sender: billingSender,
      status: r.status,
      related: { type: "invoice", label: number, href: `/admin/crm/invoices/${r.invoice_id}` },
      hasContent: false,
      canResend: false,
      resendNote: "Send it again from the invoice page.",
    });
  }

  for (const row of retention ?? []) {
    const r = row as { id: string; to_email: string; subject: string; status: string; sent_at: string | null; created_at: string };
    entries.push({
      key: `retention_email:${r.id}`,
      source: "retention_email",
      id: r.id,
      sentAt: r.sent_at ?? r.created_at,
      recipient: r.to_email,
      subject: r.subject,
      category: "Renewal / payment request",
      sender: growthSender,
      status: r.status,
      related: { type: "renewal", label: "Renewal / retention", href: null },
      hasContent: false,
      canResend: false,
      resendNote: "Sent automatically by Client Retention.",
    });
  }

  for (const row of leadEmails ?? []) {
    const r = row as { id: string; email_type: string; to_email: string; subject: string | null; status: string; sent_at: string | null; created_at: string };
    entries.push({
      key: `lead_email:${r.id}`,
      source: "lead_email",
      id: r.id,
      sentAt: r.sent_at ?? r.created_at,
      recipient: r.to_email,
      subject: r.subject ?? r.email_type.replace(/_/g, " "),
      category: categorizeLeadEmail(r.email_type),
      sender: growthSender,
      status: r.status,
      related: { type: "appointment", label: "Consultation", href: null },
      hasContent: false,
      canResend: false,
      resendNote: null,
    });
  }

  return sortCommunications(entries);
}

export type CommunicationContent = {
  subject: string;
  recipient: string;
  sender: string;
  sentAt: string;
  status: string | null;
  html: string | null;
  text: string | null;
  note: string | null;
};

// Content for the "View Email" dialog, fetched on demand (bodies are never
// shipped with the list). The row must belong to this client.
export async function getClientCommunicationContent(clientId: string, source: string, id: string): Promise<CommunicationContent | null> {
  const admin = getSupabaseAdmin();

  if (source === "client_comm") {
    const { data } = await admin.from("crm_client_communications").select("*").eq("id", id).eq("client_id", clientId).maybeSingle();
    if (!data) return null;
    return {
      subject: data.subject,
      recipient: data.recipient_email,
      sender: data.sender,
      sentAt: data.sent_at,
      status: data.status,
      html: data.body_html ? redactSecureLinks(data.body_html) : null,
      text: data.body_text ? redactSecureLinks(data.body_text) : null,
      note: data.body_html || data.body_text ? null : "The content of this email wasn't stored (it contained a one-time secure link).",
    };
  }

  if (source === "leadgen_email") {
    const { data: client } = await admin.from("crm_clients").select("leadgen_client_id").eq("id", clientId).maybeSingle();
    if (!client?.leadgen_client_id) return null;
    const { data } = await admin.from("leadgen_emails").select("*").eq("id", id).eq("client_id", client.leadgen_client_id).is("lead_id", null).maybeSingle();
    if (!data) return null;
    return {
      subject: data.subject,
      recipient: data.to_email,
      sender: data.sender_email ?? "Winsalot Corp.",
      sentAt: data.sent_at ?? data.created_at,
      status: data.status,
      html: null,
      text: data.body ? redactSecureLinks(data.body) : null,
      note: null,
    };
  }

  return null;
}

// Loads a stored, resendable email for the Resend action.
export async function loadResendableCommunication(clientId: string, id: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("crm_client_communications").select("*").eq("id", id).eq("client_id", clientId).maybeSingle();
  if (!data || !RESENDABLE_CLIENT_COMM_TYPES.has(data.email_type) || data.status === "failed" || !(data.body_html || data.body_text)) return null;
  return data;
}
