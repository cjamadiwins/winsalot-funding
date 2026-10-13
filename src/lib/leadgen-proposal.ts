import { clientGreetingName, detectProposalRequest } from "./leadgen-client-notification";
import { isHidebrandtClient, isTeknokraftClient, isWeb6SolutionsClient, type LeadgenClientRow, type LeadgenLeadRow } from "./leadgen-types";

// "Request Proposal": Winsalot emails the lead's CLIENT (never the prospect) to
// ask it to prepare a proposal for a qualified prospect. This file holds the
// pure, client-agnostic pieces - statuses, the email draft and its validation.
// Nothing here reads or writes the database.

// ---------------------------------------------------------------------------
// Proposal Status
// ---------------------------------------------------------------------------

export const PROPOSAL_STATUSES = [
  { key: "not_requested", label: "Not Requested" },
  { key: "proposal_requested", label: "Proposal Requested" },
  { key: "in_preparation", label: "In Preparation" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]["key"];

export function isProposalStatus(value: string): value is ProposalStatus {
  return PROPOSAL_STATUSES.some((s) => s.key === value);
}

export function proposalStatusLabel(status: string | null | undefined): string {
  return PROPOSAL_STATUSES.find((s) => s.key === status)?.label ?? "Not Requested";
}

export const PROPOSAL_STATUS_STYLES: Record<ProposalStatus, string> = {
  not_requested: "bg-slate-100 text-slate-600",
  proposal_requested: "bg-sky-100 text-sky-800",
  in_preparation: "bg-amber-100 text-amber-800",
  proposal_sent: "bg-indigo-100 text-indigo-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-rose-100 text-rose-800",
};

// What the status becomes when a request email has just been SENT SUCCESSFULLY.
// Emailing the client only ever means "requested": it never advances a proposal
// that is already further along (in preparation, sent, accepted) and it never
// marks anything as sent to the prospect. A fresh request after "Not Requested"
// or "Declined" starts the cycle again.
export function nextStatusAfterRequest(current: ProposalStatus | null | undefined): ProposalStatus {
  if (current === "in_preparation" || current === "proposal_sent" || current === "accepted") return current;
  return "proposal_requested";
}

// A request has been emailed at least once and not reset - used to warn before
// emailing the client a second time.
export function hasActiveProposalRequest(proposal: { status: string; request_count: number } | null | undefined): boolean {
  return Boolean(proposal && proposal.request_count > 0 && proposal.status !== "not_requested");
}

// The (client-safe) shape the lead page, Admin dashboard and client portal read.
export type LeadProposalRow = {
  id: string;
  lead_id: string;
  client_id: string;
  campaign_id: string | null;
  status: ProposalStatus;
  first_requested_at: string | null;
  last_requested_at: string | null;
  request_count: number;
  last_request_email_id: string | null;
  status_updated_at: string;
  status_updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

export const PROPOSAL_REQUIREMENTS_PLACEHOLDER = "[Insert verified prospect requirements, project scope, budget, and timeline where available.]";
export const PROPOSAL_SUBJECT_MAX = 200;
export const PROPOSAL_BODY_MAX = 10000;
export const PROPOSAL_SIGNATURE = ["Best regards,", "Winsalot Corp.", "Lead Generation Team", "info@winsalotcorp.com", "https://winsalotcorp.com"].join("\n");

export function buildProposalRequestSubject(lead: Pick<LeadgenLeadRow, "business_name">, client: Pick<LeadgenClientRow, "name">): string {
  return `Proposal Requested – ${lead.business_name.trim()} | ${client.name.trim()}`;
}

// "+1 905-227-6336" (North American numbers); anything else is shown as stored.
export function formatProposalPhone(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

// The full URL as stored (path included), with https:// added if missing.
export function formatProposalWebsite(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function isWebsiteServicesClient(client: Pick<LeadgenClientRow, "slug">): boolean {
  return isTeknokraftClient(client) || isHidebrandtClient(client) || isWeb6SolutionsClient(client);
}

function proposalKind(client: Pick<LeadgenClientRow, "slug">): string {
  return isWebsiteServicesClient(client) ? "website design proposal" : "proposal";
}

function serviceRequested(client: Pick<LeadgenClientRow, "name" | "slug">): string {
  return isWebsiteServicesClient(client)
    ? "Website design or redesign proposal — specific requirements to be confirmed."
    : `Proposal for ${client.name.trim()} services — specific requirements to be confirmed.`;
}

// What the prospect asked the proposal to cover, from the lead's own notes. Only
// the DETECTED topics are ever used (scope / cost / timeline); the notes' text is
// never copied into a message that goes outside Winsalot.
function proposalRequirements(lead: Pick<LeadgenLeadRow, "notes" | "client_notes">): string {
  const request = detectProposalRequest(lead);
  if (request.requested && request.items.length > 0) {
    return `The prospect has asked the proposal to cover: ${request.items.map((i) => i.toLowerCase()).join("; ")}. Exact requirements, budget and timeline to be confirmed with the prospect.`;
  }
  return PROPOSAL_REQUIREMENTS_PLACEHOLDER;
}

export function buildProposalRequestDraft(input: {
  client: Pick<LeadgenClientRow, "name" | "slug">;
  lead: Pick<LeadgenLeadRow, "business_name" | "contact_name" | "industry" | "email" | "phone" | "website" | "notes" | "client_notes">;
}): { subject: string; body: string } {
  const { client, lead } = input;
  const notProvided = "Not provided";
  const field = (value: string | null | undefined) => value?.trim() || notProvided;

  const body = [
    `Hello ${clientGreetingName(client.name)} Team,`,
    `We have a prospective customer interested in receiving a ${proposalKind(client)}.`,
    "Please find the prospect’s information below.",
    [
      `Business Name: ${lead.business_name.trim()}`,
      `Contact Person: ${field(lead.contact_name)}`,
      `Industry: ${field(lead.industry)}`,
      `Email: ${field(lead.email)}`,
      `Phone: ${formatProposalPhone(lead.phone) ?? notProvided}`,
      `Website: ${formatProposalWebsite(lead.website) ?? notProvided}`,
      `Service Requested: ${serviceRequested(client)}`,
      `Proposal Requirements: ${proposalRequirements(lead)}`,
    ].join("\n"),
    "Please review the opportunity and prepare an appropriate proposal based on the prospect’s requirements.",
    "Kindly confirm when the proposal is ready so we can coordinate the next steps.",
    PROPOSAL_SIGNATURE,
  ].join("\n\n");

  return { subject: buildProposalRequestSubject(lead, client), body };
}

// Server- and UI-side check of what Admin is about to send. A message that still
// carries the bracketed "[Insert ...]" requirements placeholder is not ready.
export function validateProposalRequest(input: { subject: string; body: string }): string | null {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return "A subject is required.";
  if (!body) return "An email body is required.";
  if (subject.length > PROPOSAL_SUBJECT_MAX) return `The subject is too long (${PROPOSAL_SUBJECT_MAX} characters max).`;
  if (body.length > PROPOSAL_BODY_MAX) return `The message is too long (${PROPOSAL_BODY_MAX} characters max).`;
  if (/\[\s*insert\b[^\]]*\]/i.test(`${subject}\n${body}`)) {
    return "Replace the bracketed “[Insert …]” placeholder with the prospect’s verified requirements (or remove it) before sending.";
  }
  return null;
}

export const PROPOSAL_REQUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;

// One-line text for the lead's (internal) activity timeline.
export function proposalRequestedActivityNotes(input: { clientName: string; toEmail: string; subject: string; sentBy: string; status: ProposalStatus }): string {
  return [
    "Proposal requested from the client",
    `To: ${input.clientName} <${input.toEmail}>`,
    `Subject: ${input.subject}`,
    `Sent by ${input.sentBy} (Admin). Proposal status: ${proposalStatusLabel(input.status)}.`,
  ].join("\n");
}

export function proposalStatusChangedActivityNotes(input: { from: ProposalStatus; to: ProposalStatus; changedBy: string }): string {
  return `Proposal status changed from ${proposalStatusLabel(input.from)} to ${proposalStatusLabel(input.to)} by ${input.changedBy} (Admin). No email was sent.`;
}

// Client-portal wording (the client sees its own proposals only).
export const CLIENT_PORTAL_PROPOSAL_LABELS: Record<ProposalStatus, string> = {
  not_requested: "Not requested",
  proposal_requested: "Requested",
  in_preparation: "In preparation",
  proposal_sent: "Proposal sent",
  accepted: "Accepted",
  declined: "Declined",
};

// ---------------------------------------------------------------------------
// Admin dashboard summary
// ---------------------------------------------------------------------------

// Open = requested from the client but not yet decided.
export const OPEN_PROPOSAL_STATUSES: readonly ProposalStatus[] = ["proposal_requested", "in_preparation", "proposal_sent"];

export type ProposalCounts = Record<Exclude<ProposalStatus, "not_requested">, number>;

export function summarizeProposals(rows: readonly Pick<LeadProposalRow, "status">[]): ProposalCounts {
  const counts: ProposalCounts = { proposal_requested: 0, in_preparation: 0, proposal_sent: 0, accepted: 0, declined: 0 };
  for (const row of rows) {
    if (row.status !== "not_requested") counts[row.status] += 1;
  }
  return counts;
}
