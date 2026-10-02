import {
  isHidebrandtClient,
  isTeknokraftClient,
  isValidEmail,
  isWeb6SolutionsClient,
  type LeadgenClientRow,
  type LeadgenLeadRow,
} from "./leadgen-types";

// Admin "Email Client" lead notification - the pure, client-agnostic pieces
// (reason list, recipient resolution, communication-preference detection and
// the prefilled draft). The send itself reuses sendLeadgenEmail; nothing in
// here reads or writes the database.

export const CLIENT_NOTIFICATION_TYPES = [
  { key: "interested_lead", label: "Interested Lead" },
  { key: "proposal_requested", label: "Proposal Requested" },
  { key: "appointment_requested", label: "Appointment Requested" },
  { key: "callback_follow_up", label: "Callback / Client Follow-up Required" },
  { key: "additional_information", label: "Additional Information Requested" },
  { key: "custom", label: "Custom" },
] as const;

export type ClientNotificationType = (typeof CLIENT_NOTIFICATION_TYPES)[number]["key"];

export function isClientNotificationType(value: string): value is ClientNotificationType {
  return CLIENT_NOTIFICATION_TYPES.some((t) => t.key === value);
}

export function clientNotificationLabel(type: string | null | undefined): string {
  return CLIENT_NOTIFICATION_TYPES.find((t) => t.key === type)?.label ?? "Client notification";
}

// ---------------------------------------------------------------------------
// Recipient: always the client the lead belongs to - never typed by Admin.
// ---------------------------------------------------------------------------

export type ClientNotificationRecipient = { email: string; name: string | null };

export function resolveClientNotificationRecipient(
  client: Pick<LeadgenClientRow, "name" | "contact_name" | "contact_email">,
): { recipient: ClientNotificationRecipient } | { error: string } {
  const email = client.contact_email?.trim() ?? "";
  if (!email) return { error: `No contact email is saved for ${client.name}. Add one in Client Settings before emailing the client.` };
  if (!isValidEmail(email)) return { error: `The contact email saved for ${client.name} isn't a valid address. Correct it in Client Settings.` };
  return { recipient: { email, name: client.contact_name?.trim() || null } };
}

// "Teknokraft Canada Inc." -> "Teknokraft" for a "Hi Teknokraft team," greeting.
export function clientGreetingName(clientName: string): string {
  let name = clientName.trim();
  const suffix = /[\s,]+(inc|incorporated|ltd|limited|llc|corp|corporation|co)\.?$/i;
  while (suffix.test(name)) name = name.replace(suffix, "");
  name = name.replace(/\s+canada$/i, "");
  return name.trim() || clientName.trim();
}

// ---------------------------------------------------------------------------
// Prospect communication preferences, read from the lead's own notes/status.
// Nothing is global or per-client: a preference appears only when THIS lead's
// text says so.
// ---------------------------------------------------------------------------

export type CommunicationPreferenceKind = "email_only" | "call_requested" | "specific_time";

export type CommunicationPreference = {
  kind: CommunicationPreferenceKind;
  label: string;
  // The lead text (or status) the preference was read from, shown next to the
  // banner so Admin can see exactly why it appeared.
  evidence: string;
};

function excerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const dot = text.indexOf(".", index + length);
  const end = dot === -1 ? text.length : dot + 1;
  return text.slice(start, end).trim();
}

const EMAIL_ONLY_EXPLICIT = /\be-?mail\s+only\b|\bonly\s+(?:by\s+|via\s+)?e-?mail\b|\bprefers?\s+(?:to\s+be\s+contacted\s+(?:by|via)\s+)?e-?mail\b|\bno\s+phone\s+calls?\b/i;
const DO_NOT_CALL = /\b(?:do\s*n[o']?t|don'?t)\s+(?:call|phone)\b|\bno\s+calls?\b/i;
// A lead who "requests a proposal via email" is asking to be answered by
// email; treated as email-only (banner shows the note it came from).
const EMAIL_REQUESTED = /\b(?:request|ask|want|prefer|like)\w*\b[^.\n]*\b(?:via|by|through|over)\s+e-?mail\b/i;
const CALL_REQUESTED = /\bcall\s+(?:me|us)\s+back\b|\bcall\s+requested\b|\bplease\s+call\b|\brequests?\s+a\s+(?:phone\s+)?call\b|\bcallback\s+requested\b/i;
const SPECIFIC_TIME =
  /\b(?:call|reach|contact|phone)\b[^.\n]*\b(?:after|before|at|between|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b|\b(?:mornings?|afternoons?|evenings?)\s+(?:only|preferred|are\s+best)\b/i;

export const EMAIL_ONLY_LABEL = "EMAIL ONLY — DO NOT CALL";

export function detectCommunicationPreferences(lead: Pick<LeadgenLeadRow, "status" | "notes" | "client_notes" | "source_notes">): CommunicationPreference[] {
  const text = [lead.notes, lead.client_notes, lead.source_notes].filter((t): t is string => Boolean(t && t.trim())).join("\n");
  const found: CommunicationPreference[] = [];

  let emailOnly: CommunicationPreference | null = null;
  for (const pattern of [EMAIL_ONLY_EXPLICIT, DO_NOT_CALL, EMAIL_REQUESTED]) {
    const match = pattern.exec(text);
    if (match) {
      emailOnly = { kind: "email_only", label: EMAIL_ONLY_LABEL, evidence: excerpt(text, match.index, match[0].length) };
      break;
    }
  }
  if (!emailOnly && lead.status === "Do not call") {
    emailOnly = { kind: "email_only", label: EMAIL_ONLY_LABEL, evidence: "Lead status is “Do not call”." };
  }
  if (emailOnly) found.push(emailOnly);

  const callRequested = CALL_REQUESTED.exec(text);
  if (callRequested && !emailOnly) {
    found.push({ kind: "call_requested", label: "CALL REQUESTED", evidence: excerpt(text, callRequested.index, callRequested[0].length) });
  }
  const specificTime = SPECIFIC_TIME.exec(text);
  if (specificTime && !emailOnly) {
    found.push({ kind: "specific_time", label: "SPECIFIC CONTACT TIME REQUESTED", evidence: excerpt(text, specificTime.index, specificTime[0].length) });
  }
  return found;
}

// ---------------------------------------------------------------------------
// What the prospect asked for (proposal items), read from the lead's notes.
// ---------------------------------------------------------------------------

export type ProposalRequest = { requested: boolean; items: string[] };

export function detectProposalRequest(lead: Pick<LeadgenLeadRow, "notes" | "client_notes">): ProposalRequest {
  const text = [lead.notes, lead.client_notes].filter(Boolean).join("\n");
  if (!/\b(?:proposal|quote|quotation|estimate)\b/i.test(text)) return { requested: false, items: [] };
  const items: string[] = [];
  if (/\bscope\b/i.test(text)) items.push("Scope of work");
  if (/\b(?:costs?|pric(?:e|es|ing)|quote|budget)\b/i.test(text)) items.push("Project cost");
  if (/\b(?:duration|timeline|completion|how\s+long)\b/i.test(text)) items.push("Estimated project duration / completion timeline");
  return { requested: true, items };
}

// ---------------------------------------------------------------------------
// Lead fields for the draft. Imported leads sometimes carry the full Maps
// address plus a trailing category in `city` ("14 Foundry Ave, Toronto, ON
// M6H 0A8, Canada General contractor"); split that so the draft shows a clean
// location and category without altering the stored lead.
// ---------------------------------------------------------------------------

function titleCase(value: string): string {
  return value.replace(/\b([a-z])([a-z]*)/gi, (_m, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
}

export function parseLeadLocation(lead: Pick<LeadgenLeadRow, "city" | "province">): { location: string | null; category: string | null } {
  const city = lead.city?.trim() ?? "";
  const province = lead.province?.trim() ?? "";
  if (!city) return { location: province || null, category: null };

  let category: string | null = null;
  const withCategory = /^(.*?,\s*Canada)\s+(.+)$/i.exec(city);
  const address = withCategory ? withCategory[1] : city;
  if (withCategory) category = titleCase(withCategory[2].trim());

  const parsed = /,\s*([^,]+?),\s*([A-Z]{2})\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/.exec(address);
  if (parsed) return { location: `${parsed[1].trim()}, ${parsed[2]}`, category };
  const clean = address.length <= 40 && !/\d/.test(address);
  if (clean) return { location: [address, province].filter(Boolean).join(", "), category };
  return { location: province || null, category };
}

export function formatLeadPhone(phone: string | null): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return raw;
}

export function displayWebsite(website: string | null): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

export function leadIndustryDisplay(lead: Pick<LeadgenLeadRow, "industry" | "city" | "province">): string | null {
  const industry = lead.industry?.trim() || null;
  const { category } = parseLeadLocation(lead);
  if (industry && category && !industry.toLowerCase().includes(category.toLowerCase())) return `${industry} / ${category}`;
  return industry ?? category;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export function defaultNotificationType(lead: Pick<LeadgenLeadRow, "status" | "notes" | "client_notes">): ClientNotificationType {
  if (detectProposalRequest(lead).requested) return "proposal_requested";
  if (lead.status === "Callback requested") return "callback_follow_up";
  if (lead.status === "Information requested") return "additional_information";
  return "interested_lead";
}

function serviceLabel(client: Pick<LeadgenClientRow, "slug">): string {
  return isTeknokraftClient(client) || isHidebrandtClient(client) || isWeb6SolutionsClient(client) ? "website services" : "your services";
}

export function buildClientNotificationSubject(lead: Pick<LeadgenLeadRow, "business_name">, type: ClientNotificationType): string {
  if (type === "interested_lead") return `Interested Lead – ${lead.business_name}`;
  if (type === "custom") return `Lead Update – ${lead.business_name}`;
  return `Interested Lead – ${lead.business_name} – ${clientNotificationLabel(type)}`;
}

export function buildClientNotificationDraft(input: {
  client: Pick<LeadgenClientRow, "name" | "slug">;
  lead: LeadgenLeadRow;
  type: ClientNotificationType;
}): { subject: string; body: string } {
  const { client, lead, type } = input;
  const biz = lead.business_name;
  const service = serviceLabel(client);
  const prefs = detectCommunicationPreferences(lead);
  const emailOnly = prefs.some((p) => p.kind === "email_only");
  const proposal = detectProposalRequest(lead);

  const intro: Record<ClientNotificationType, string> = {
    interested_lead: `${biz} has expressed interest in ${service}.`,
    proposal_requested: `${biz} has expressed interest in ${service} and has requested a detailed proposal${emailOnly ? " by email" : ""}.`,
    appointment_requested: `${biz} has expressed interest in ${service} and would like to schedule an appointment.`,
    callback_follow_up: `${biz} has asked for a follow-up from your team regarding ${service}.`,
    additional_information: `${biz} has expressed interest in ${service} and has requested additional information.`,
    custom: `Please see the update below regarding ${biz}.`,
  };

  const blocks: string[] = [`Hi ${clientGreetingName(client.name)} team,`, intro[type]];

  for (const pref of prefs) {
    if (pref.kind === "email_only") blocks.push("Important: The prospect prefers email communication only and does not want a phone call at this stage.");
    else if (pref.kind === "call_requested") blocks.push("Important: The prospect has asked to be called.");
    else blocks.push(`Important: The prospect has asked for a specific contact time (“${pref.evidence}”).`);
  }

  if (type === "proposal_requested" && proposal.items.length > 0) {
    blocks.push(["They would like the proposal to include:", ...proposal.items.map((i) => `• ${i}`)].join("\n"));
  }

  const { location } = parseLeadLocation(lead);
  const detailLines = [
    ["Business", biz],
    ["Contact", lead.contact_name?.trim() || null],
    ["Email", lead.email?.trim() || null],
    ["Phone", formatLeadPhone(lead.phone)],
    ["Website", displayWebsite(lead.website)],
    ["Industry", leadIndustryDisplay(lead)],
    ["Location", location],
  ]
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(([label, value]) => `${label}: ${value}`);
  blocks.push(["Lead details:", ...detailLines].join("\n"));

  blocks.push(
    `${emailOnly ? "Please follow up with the prospect directly by email." : "Please follow up with the prospect directly."} Once contact has been made, please update us on the outcome so we can keep the campaign record current.`,
  );
  blocks.push("Regards,\nWinsalot Corp.");

  return { subject: buildClientNotificationSubject(lead, type), body: blocks.join("\n\n") };
}

// Single-line text for the lead's activity timeline entry.
export function clientNotifiedActivityNotes(input: { type: ClientNotificationType; clientName: string; toEmail: string; subject: string; sentBy: string }): string {
  return [
    `Client notified – ${clientNotificationLabel(input.type)}`,
    `To: ${input.clientName} <${input.toEmail}>`,
    `Subject: ${input.subject}`,
    `Sent by ${input.sentBy} (Admin).`,
  ].join("\n");
}
