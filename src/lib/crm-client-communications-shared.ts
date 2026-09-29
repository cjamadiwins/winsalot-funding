// Pure helpers shared by the server loader and the client-profile UI (no
// server-only imports so they can also be unit tested and used in a client
// component).

export type CommunicationSource = "client_comm" | "leadgen_email" | "invoice_email" | "retention_email" | "lead_email";

export type CommunicationCategory =
  | "Payment receipt"
  | "Client portal invitation"
  | "Campaign setup"
  | "Appointment / consultation"
  | "Campaign report"
  | "Renewal / payment request"
  | "Agreement"
  | "Client update"
  | "Other";

export type CommunicationRelated = { type: "payment" | "agreement" | "invoice" | "report" | "appointment" | "portal" | "renewal"; label: string; href: string | null };

// One normalized row per email, whichever table it is logged in.
export type ClientCommunicationEntry = {
  key: string; // `${source}:${id}` - unique across sources
  source: CommunicationSource;
  id: string;
  sentAt: string;
  recipient: string;
  subject: string;
  category: CommunicationCategory;
  sender: string;
  status: string | null;
  related: CommunicationRelated | null;
  hasContent: boolean;
  canResend: boolean;
  resendNote: string | null;
};

export const CLIENT_COMM_TYPE_LABELS: Record<string, CommunicationCategory> = {
  payment_receipt: "Payment receipt",
  agreement_sent: "Agreement",
  agreement_signed_copy: "Agreement",
  intake_form: "Agreement",
  client_update: "Client update",
  campaign_setup: "Campaign setup",
};

// Only these can be re-sent from the profile, and always behind an explicit
// Admin confirmation. Everything else has its own dedicated, safer flow
// (agreements and portal invitations carry one-time secure links; invoices
// and renewals are sent by their own workflows).
export const RESENDABLE_CLIENT_COMM_TYPES = new Set(["payment_receipt", "client_update", "campaign_setup"]);

// Maps an existing leadgen_emails row (client-level: lead_id is null) to a
// category, from its template key / subject.
export function categorizeLeadgenEmail(templateKey: string | null, subject: string): CommunicationCategory {
  const s = subject.toLowerCase();
  if (s.includes("client portal")) return "Client portal invitation";
  if (s.includes("report")) return "Campaign report";
  if (templateKey && /report/i.test(templateKey)) return "Campaign report";
  return "Client update";
}

export function categorizeLeadEmail(emailType: string): CommunicationCategory {
  return /consultation|appointment|reminder|booking/i.test(emailType) ? "Appointment / consultation" : "Other";
}

export function categorizeInvoiceEmail(emailType: string): CommunicationCategory {
  return emailType === "invoice_receipt" ? "Payment receipt" : "Renewal / payment request";
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  delayed: "Delayed",
  bounced: "Bounced",
  complained: "Marked as spam",
  opened: "Opened",
  clicked: "Clicked",
  failed: "Failed",
};

export function communicationStatusLabel(status: string | null): string {
  if (!status) return "Not tracked";
  return STATUS_LABELS[status] ?? status;
}

// Newest first; a stable tie-break on key keeps the order deterministic.
export function sortCommunications(entries: ClientCommunicationEntry[]): ClientCommunicationEntry[] {
  return [...entries].sort((a, b) => {
    const diff = new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
    return diff !== 0 ? diff : a.key.localeCompare(b.key);
  });
}

// Secure one-time links (portal setup/reset tokens, agreement/intake signing
// links) must never be readable in a stored email body, even by Admin.
export function redactSecureLinks(html: string): string {
  return html
    .replace(/(token_hash=)[^&"'\s<]+/gi, "$1[hidden]")
    .replace(/(https?:\/\/[^\s"'<]*\/(?:agreement-sign|client-intake|intake-form|client\/setup|client\/reset-password)[^\s"'<]*)/gi, "[secure link hidden]");
}

export const CAMPAIGN_SETUP_SUBJECT = "Your Winsalot Corp. Campaign Setup Is Complete";

function longDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// A DRAFT for Admin to review and edit before sending - built only from what
// the client's record actually says; nothing is sent automatically. The FINAL
// edited version is what gets logged.
export function buildCampaignSetupDraft(input: {
  contactName: string | null;
  companyName: string;
  campaignName: string | null;
  service: string | null;
  campaignStartDate: string | null;
  depositReceivedLabel: string | null;
}): { subject: string; message: string } {
  const greeting = (input.contactName ?? "").trim().split(/\s+/)[0] || "there";
  const summary: string[] = [`• Campaign: ${input.campaignName || input.service || input.companyName}`];
  const start = longDate(input.campaignStartDate);
  if (start) summary.push(`• Campaign start date: ${start}`);
  if (input.depositReceivedLabel) summary.push(`• Initial campaign deposit: ${input.depositReceivedLabel} received - thank you`);

  const message = [
    `Hi ${greeting},`,
    `Thank you for choosing Winsalot Corp. Your campaign setup for ${input.companyName} is now complete.`,
    `Here is a quick summary:\n${summary.join("\n")}`,
    [
      "What happens next:",
      "• Our team is ready to begin contacting businesses on your behalf and booking appointments for you.",
      "• Once your Winsalot Client Portal is activated, you can follow your leads, appointments and reports there. Your secure setup link is sent separately.",
    ].join("\n"),
    "If you have any questions, just reply to this email.",
    "Best regards,\nWinsalot Corp.\nEmpowering Businesses, One Solution at a Time.",
  ].join("\n\n");

  return { subject: CAMPAIGN_SETUP_SUBJECT, message };
}
