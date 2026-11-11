// Client qualification + appointment quality control - pure logic shared by the
// agent form, the Admin review screen, the server actions and the tests. No
// server-only imports. The database enforces the same rules with triggers
// (supabase/migrations/20261103120000_leadgen_appointment_qualification.sql);
// everything here is for early, friendly feedback and for display.

import { websiteOpportunity } from "./leadgen-website-opportunity";

// ---------------------------------------------------------------------------
// Services a client can offer. Each client has its OWN approved list - one
// client's services are never assumed to be offered by another.
// ---------------------------------------------------------------------------
export const QUALIFICATION_SERVICE_KEYS = ["new_website", "redesign_rebranding", "ecommerce", "seo_visibility", "human_search_optimization", "digital_marketing"] as const;
export type QualificationServiceKey = (typeof QUALIFICATION_SERVICE_KEYS)[number];

export const QUALIFICATION_SERVICE_LABELS: Record<QualificationServiceKey, string> = {
  new_website: "New website development",
  redesign_rebranding: "Website redesign and rebranding",
  ecommerce: "E-commerce website development",
  seo_visibility: "SEO and online visibility",
  human_search_optimization: "Human search optimization",
  digital_marketing: "Digital marketing",
};

export const CUSTOM_SERVICE_PREFIX = "custom:";

export function isCustomService(key: string): boolean {
  return key.startsWith(CUSTOM_SERVICE_PREFIX) && key.length > CUSTOM_SERVICE_PREFIX.length;
}
export function isValidServiceKey(key: string): boolean {
  return (QUALIFICATION_SERVICE_KEYS as readonly string[]).includes(key) || isCustomService(key);
}
export function serviceLabel(key: string): string {
  if (isCustomService(key)) return key.slice(CUSTOM_SERVICE_PREFIX.length);
  return QUALIFICATION_SERVICE_LABELS[key as QualificationServiceKey] ?? key;
}
export function customServiceKey(label: string): string | null {
  const clean = label.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  return clean ? `${CUSTOM_SERVICE_PREFIX}${clean}` : null;
}

// ---------------------------------------------------------------------------
// Lead filtering categories
// ---------------------------------------------------------------------------
export const QUALIFICATION_CATEGORIES = [
  "no_website_new",
  "existing_website_redesign",
  "seo_visibility",
  "ecommerce",
  "multiple_services",
  "requires_further_qualification",
  "not_qualified_lead_gen_only",
] as const;
export type QualificationCategory = (typeof QUALIFICATION_CATEGORIES)[number];

export const QUALIFICATION_CATEGORY_LABELS: Record<QualificationCategory, string> = {
  no_website_new: "No Website — Potential New Website",
  existing_website_redesign: "Existing Website — Redesign Opportunity",
  seo_visibility: "SEO / Online Visibility Opportunity",
  ecommerce: "E-commerce Opportunity",
  multiple_services: "Multiple Website Services",
  requires_further_qualification: "Requires Further Qualification",
  not_qualified_lead_gen_only: "Not Qualified — Seeking Lead Generation Only",
};

export const QUALIFICATION_OUTCOMES = ["draft", "qualified", "requires_further_qualification", "not_qualified"] as const;
export type QualificationOutcome = (typeof QUALIFICATION_OUTCOMES)[number];
export const QUALIFICATION_OUTCOME_LABELS: Record<QualificationOutcome, string> = {
  draft: "In progress",
  qualified: "Qualified",
  requires_further_qualification: "Needs follow-up",
  not_qualified: "Not qualified",
};

// ---------------------------------------------------------------------------
// The eight mandatory questions
// ---------------------------------------------------------------------------
export type YesNoUnsure = "yes" | "no" | "unsure";
export type InterestKind = "new_website" | "redesign" | "both" | "neither" | "unsure";
export type GoogleInterest = "yes" | "more" | "no";
export type OnlineSatisfaction = "satisfied" | "not_satisfied";
export type YesNoMore = "yes" | "no" | "more";
export type SpecialistInterest = "yes" | "no" | "follow_up";
export type DecisionMaker = "yes" | "no" | "unsure";
export type Satisfaction = "satisfied" | "not_satisfied" | "unsure" | "not_applicable";

export type QualificationAnswers = {
  has_website: YesNoUnsure | null;
  website_url: string | null;
  interested_in_new_or_redesign: InterestKind | null;
  satisfied_with_site: Satisfaction | null;
  needs_ecommerce: YesNoUnsure | null;
  interested_in_seo: YesNoUnsure | null;
  challenges: string | null;
  understands_services: boolean | null;
  agreed_to_appointment: boolean | null;
  services_of_interest: string[];
  intended_improvements: string | null;
  qualification_notes: string | null;
  lead_gen_only: boolean;
  // Google visibility / marketing step of the Hidebrandt and Teknokraft call
  // guides. Optional extras: they never gate "qualified" and stay null for
  // every other client.
  google_interest: GoogleInterest | null;
  online_customers_satisfied: OnlineSatisfaction | null;
  google_visibility: YesNoUnsure | null;
  ai_search_interest: YesNoMore | null;
  investing_marketing: YesNoUnsure | null;
  specialist_interest: SpecialistInterest | null;
  // Confirmations a qualified appointment needs (20261112000000): the person
  // is the owner / decision-maker, their contact details were verified, and
  // the appointment date and time were confirmed with them.
  decision_maker: DecisionMaker | null;
  contact_verified: boolean | null;
  appointment_confirmed: boolean | null;
};

// Columns added after the original qualification table (20261111120000 and
// 20261112000000). They are left out of a save while unanswered, so a lead
// that never used them saves exactly as before.
export const GOOGLE_MARKETING_FIELDS = [
  "google_interest",
  "online_customers_satisfied",
  "google_visibility",
  "ai_search_interest",
  "investing_marketing",
  "specialist_interest",
  "decision_maker",
  "contact_verified",
  "appointment_confirmed",
] as const;

export const EMPTY_ANSWERS: QualificationAnswers = {
  has_website: null,
  website_url: null,
  interested_in_new_or_redesign: null,
  satisfied_with_site: null,
  needs_ecommerce: null,
  interested_in_seo: null,
  challenges: null,
  understands_services: null,
  agreed_to_appointment: null,
  services_of_interest: [],
  intended_improvements: null,
  qualification_notes: null,
  lead_gen_only: false,
  google_interest: null,
  online_customers_satisfied: null,
  google_visibility: null,
  ai_search_interest: null,
  investing_marketing: null,
  specialist_interest: null,
  decision_maker: null,
  contact_verified: null,
  appointment_confirmed: null,
};

export const QUALIFICATION_QUESTIONS = [
  { key: "has_website", label: "Does the business currently have a website?" },
  { key: "interested_in_new_or_redesign", label: "Is the prospect interested in a new website or a redesign?" },
  { key: "satisfied_with_site", label: "Is the prospect satisfied with the current website?" },
  { key: "needs_ecommerce", label: "Does the business require e-commerce functionality?" },
  { key: "interested_in_seo", label: "Is the prospect interested in improving search visibility or SEO?" },
  { key: "challenges", label: "What specific website-related challenges does the business face?" },
  { key: "understands_services", label: "Does the prospect understand the services being offered?" },
  { key: "agreed_to_appointment", label: "Has the prospect agreed to an appointment to discuss those services?" },
] as const;
export type QualificationQuestionKey = (typeof QUALIFICATION_QUESTIONS)[number]["key"];

const TEXT_LIMIT = 2000;

function cleanText(value: unknown, max = TEXT_LIMIT): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

export function normalizeAnswers(raw: Partial<Record<keyof QualificationAnswers, unknown>>): QualificationAnswers {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null);
  const bool = (value: unknown): boolean | null => (value === true || value === "true" ? true : value === false || value === "false" ? false : null);
  const services = Array.isArray(raw.services_of_interest) ? raw.services_of_interest.map(String).filter(isValidServiceKey) : [];
  return {
    has_website: pick(raw.has_website, ["yes", "no", "unsure"] as const),
    website_url: cleanText(raw.website_url, 500),
    interested_in_new_or_redesign: pick(raw.interested_in_new_or_redesign, ["new_website", "redesign", "both", "neither", "unsure"] as const),
    satisfied_with_site: pick(raw.satisfied_with_site, ["satisfied", "not_satisfied", "unsure", "not_applicable"] as const),
    needs_ecommerce: pick(raw.needs_ecommerce, ["yes", "no", "unsure"] as const),
    interested_in_seo: pick(raw.interested_in_seo, ["yes", "no", "unsure"] as const),
    challenges: cleanText(raw.challenges),
    understands_services: bool(raw.understands_services),
    agreed_to_appointment: bool(raw.agreed_to_appointment),
    services_of_interest: Array.from(new Set(services)),
    intended_improvements: cleanText(raw.intended_improvements),
    qualification_notes: cleanText(raw.qualification_notes),
    lead_gen_only: raw.lead_gen_only === true || raw.lead_gen_only === "true",
    google_interest: pick(raw.google_interest, ["yes", "more", "no"] as const),
    online_customers_satisfied: pick(raw.online_customers_satisfied, ["satisfied", "not_satisfied"] as const),
    google_visibility: pick(raw.google_visibility, ["yes", "no", "unsure"] as const),
    ai_search_interest: pick(raw.ai_search_interest, ["yes", "no", "more"] as const),
    investing_marketing: pick(raw.investing_marketing, ["yes", "no", "unsure"] as const),
    specialist_interest: pick(raw.specialist_interest, ["yes", "no", "follow_up"] as const),
    decision_maker: pick(raw.decision_maker, ["yes", "no", "unsure"] as const),
    contact_verified: bool(raw.contact_verified),
    appointment_confirmed: bool(raw.appointment_confirmed),
  };
}

// Mirrors leadgen_qualification_missing() in the migration.
export function missingAnswers(a: QualificationAnswers): QualificationQuestionKey[] {
  const missing: QualificationQuestionKey[] = [];
  if (a.has_website == null) missing.push("has_website");
  if (a.interested_in_new_or_redesign == null) missing.push("interested_in_new_or_redesign");
  if (a.satisfied_with_site == null) missing.push("satisfied_with_site");
  if (a.needs_ecommerce == null) missing.push("needs_ecommerce");
  if (a.interested_in_seo == null) missing.push("interested_in_seo");
  if (!a.challenges?.trim()) missing.push("challenges");
  if (a.understands_services == null) missing.push("understands_services");
  if (a.agreed_to_appointment == null) missing.push("agreed_to_appointment");
  return missing;
}

// Qualifications created before the call confirmations existed keep working
// under the earlier rule. Mirrors the cut-off in
// leadgen_qualification_is_qualifiable() (20261112000000).
export const CALL_CONFIRMATIONS_CUTOFF = "2026-11-11T00:00:00Z";
export function isLegacyQualification(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t < Date.parse(CALL_CONFIRMATIONS_CUTOFF);
}

export type QualifiableResult = { ok: boolean; reasons: string[] };

// Mirrors leadgen_qualification_is_qualifiable(): an appointment may be marked
// Qualified only when every rule below holds.
// `legacy` skips the three call confirmations for records created before they
// existed (the database applies the same cut-off), so old approvals still work.
export function evaluateQualifiable(a: QualificationAnswers, approvedServices: readonly string[], opts: { legacy?: boolean } = {}): QualifiableResult {
  const reasons: string[] = [];
  const missing = missingAnswers(a);
  if (missing.length > 0) {
    const labels = QUALIFICATION_QUESTIONS.filter((q) => missing.includes(q.key)).map((q) => q.label);
    reasons.push(`Answer every required question (${labels.length} missing).`);
  }
  if (a.lead_gen_only) reasons.push("The prospect wants lead generation only - this is not a website-services appointment.");
  if (a.understands_services !== true) reasons.push("The prospect must understand the services being offered.");
  if (a.agreed_to_appointment !== true) reasons.push("The prospect must agree to an appointment to discuss those services.");
  if (!opts.legacy) {
    if (a.decision_maker !== "yes") reasons.push("Confirm the person is the owner or the decision-maker (or the appropriate contact for this decision).");
    if (a.contact_verified !== true) reasons.push("Verify the contact's name, phone number and email address.");
    if (a.appointment_confirmed !== true) reasons.push("Confirm the appointment date and time with the prospect.");
  }
  const approved = new Set(approvedServices);
  if (!a.services_of_interest.some((s) => approved.has(s))) reasons.push("Confirm interest in at least one service this client offers.");
  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Preliminary classification (never final until an agent verifies it)
// ---------------------------------------------------------------------------
// Before the agent has asked anything: derived only from the lead's own
// website field, via the same rule the call-list import uses.
export function preliminaryCategoryFromLead(website: string | null | undefined): QualificationCategory {
  const kind = websiteOpportunity(website);
  if (kind === "rebranding") return "existing_website_redesign";
  if (kind === "new_website") return "no_website_new";
  return "requires_further_qualification";
}

// From the agent's answers. Only services the client has approved count.
export function classifyFromAnswers(a: QualificationAnswers, approvedServices: readonly string[]): QualificationCategory {
  if (a.lead_gen_only) return "not_qualified_lead_gen_only";
  const approved = new Set(approvedServices);
  const wants = new Set<"new" | "redesign" | "ecommerce" | "seo">();
  if (a.interested_in_new_or_redesign === "new_website" || a.interested_in_new_or_redesign === "both") wants.add("new");
  if (a.interested_in_new_or_redesign === "redesign" || a.interested_in_new_or_redesign === "both") wants.add("redesign");
  if (a.needs_ecommerce === "yes") wants.add("ecommerce");
  if (a.interested_in_seo === "yes") wants.add("seo");
  // Drop anything the client does not offer.
  if (!approved.has("new_website")) wants.delete("new");
  if (!approved.has("redesign_rebranding")) wants.delete("redesign");
  if (!approved.has("ecommerce")) wants.delete("ecommerce");
  if (!approved.has("seo_visibility") && !approved.has("human_search_optimization") && !approved.has("digital_marketing")) wants.delete("seo");
  if (wants.size >= 2) return "multiple_services";
  if (wants.size === 0) return "requires_further_qualification";
  const only = Array.from(wants)[0];
  if (only === "ecommerce") return "ecommerce";
  if (only === "seo") return "seo_visibility";
  if (only === "redesign") return a.has_website === "no" ? "requires_further_qualification" : "existing_website_redesign";
  return a.has_website === "no" ? "no_website_new" : a.has_website === "yes" ? "existing_website_redesign" : "requires_further_qualification";
}

// What outcome the agent's answers support. The agent chooses to submit; this
// only says whether "qualified" is allowed or what to suggest instead.
export function suggestOutcome(a: QualificationAnswers, approvedServices: readonly string[]): QualificationOutcome {
  if (a.lead_gen_only) return "not_qualified";
  if (evaluateQualifiable(a, approvedServices).ok) return "qualified";
  if (a.interested_in_new_or_redesign === "neither" && a.needs_ecommerce !== "yes" && a.interested_in_seo !== "yes") return "not_qualified";
  return "requires_further_qualification";
}

// ---------------------------------------------------------------------------
// Appointment review status
// ---------------------------------------------------------------------------
export const QC_STATUSES = ["not_required", "pending_review", "needs_info", "approved", "rejected"] as const;
export type QcStatus = (typeof QC_STATUSES)[number];
export const QC_STATUS_LABELS: Record<QcStatus, string> = {
  not_required: "No review required",
  pending_review: "Awaiting Admin approval",
  needs_info: "More qualification requested",
  approved: "Approved",
  rejected: "Rejected",
};
export const QC_STATUS_STYLES: Record<QcStatus, string> = {
  not_required: "bg-slate-100 text-slate-600",
  pending_review: "bg-amber-100 text-amber-800",
  needs_info: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

// Client-facing notices, prospect confirmations, reminders and briefs may go
// out only in these states. Mirrors leadgen_appointment_client_notifiable().
export function isClientNotifiable(qcStatus: string | null | undefined): boolean {
  return !qcStatus || qcStatus === "not_required" || qcStatus === "approved";
}

export const AWAITING_APPROVAL_MESSAGE = "This appointment is awaiting Admin approval (Appointment Quality Control), so no client or prospect message can be sent yet.";

export const REJECTION_REASON_OPTIONS = [
  "Prospect wants lead generation only",
  "No interest in website services",
  "Service not offered by this client",
  "Prospect did not understand the offer",
  "Insufficient qualification",
  "Duplicate or already contacted",
  "Other",
] as const;

// "Option — detail" -> "Option" so reasons can be counted.
export function rejectionReasonBucket(reason: string | null | undefined): string {
  const text = (reason ?? "").trim();
  if (!text) return "No reason recorded";
  const head = text.split(" — ")[0].trim();
  return (REJECTION_REASON_OPTIONS as readonly string[]).includes(head) ? head : "Other";
}
export function composeRejectionReason(option: string, detail: string): string {
  const head = (REJECTION_REASON_OPTIONS as readonly string[]).includes(option) ? option : "Other";
  const extra = detail.trim().slice(0, 500);
  return extra ? `${head} — ${extra}` : head;
}

// ---------------------------------------------------------------------------
// Appointment preparation brief - the qualification section
// ---------------------------------------------------------------------------
export type BriefQualificationInput = {
  answers: QualificationAnswers;
  verified: boolean; // true only when the qualification was submitted as 'qualified'
  prospectName: string | null;
  businessName: string;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  agentName: string | null;
  leadWebsite: string | null;
};

const INTEREST_TEXT: Record<InterestKind, string> = {
  new_website: "A new website",
  redesign: "A website redesign",
  both: "A new website or a redesign",
  neither: "Not interested in a new website or redesign",
  unsure: "Not confirmed",
};

const YNU_TEXT: Record<string, string> = { yes: "Yes", no: "No", unsure: "Not sure", more: "Wants to know more", follow_up: "Follow up later" };
const GOOGLE_INTEREST_TEXT: Record<GoogleInterest, string> = { yes: "Interested in ranking higher on Google", more: "Asked to hear more about Google visibility", no: "Not interested in Google visibility" };

const DECISION_MAKER_TEXT: Record<DecisionMaker, string> = { yes: "Confirmed owner / decision-maker", no: "Not the decision-maker", unsure: "Not confirmed" };

// Who accepted the appointment and what was confirmed. Nothing is shown for
// records that never recorded these (older qualifications).
export function buildConfirmationBriefLines(a: QualificationAnswers): string[] {
  if (a.decision_maker === null && a.contact_verified === null && a.appointment_confirmed === null) return [];
  return [
    `Appointment accepted by: ${a.decision_maker ? DECISION_MAKER_TEXT[a.decision_maker] : "Not recorded"}`,
    `Contact details verified by the agent: ${a.contact_verified === null ? "Not recorded" : a.contact_verified ? "Yes" : "No"}`,
    `Date and time confirmed with the prospect: ${a.appointment_confirmed === null ? "Not recorded" : a.appointment_confirmed ? "Yes" : "No"}`,
  ];
}

// Google visibility / marketing interests for the appointment preparation
// brief. Empty (no lines at all) unless the guide's Google step was used, so
// every other client's brief is unchanged. Wording never implies a promise.
export function buildMarketingBriefLines(a: QualificationAnswers): string[] {
  const hasAny = GOOGLE_MARKETING_FIELDS.some((f) => a[f] !== null);
  const marketingServices = a.services_of_interest.filter((s) => ["seo_visibility", "human_search_optimization", "digital_marketing"].includes(s)).map(serviceLabel);
  if (!hasAny && marketingServices.length === 0) return [];
  const say = (v: string | null) => (v ? (YNU_TEXT[v] ?? v) : "Not asked");
  const lines = ["Google visibility and marketing interests (as stated by the prospect)"];
  if (marketingServices.length > 0) lines.push(`Marketing services of interest: ${marketingServices.join(", ")}`);
  if (a.google_interest) lines.push(`Google ranking interest: ${GOOGLE_INTEREST_TEXT[a.google_interest]}`);
  if (a.online_customers_satisfied) lines.push(`Satisfied with how customers find the business online: ${a.online_customers_satisfied === "satisfied" ? "Yes" : "No"}`);
  if (a.google_visibility) lines.push(`Customers currently finding the business through Google: ${say(a.google_visibility)}`);
  if (a.ai_search_interest) lines.push(`Wants to be easier to discover through Google and AI-powered search: ${say(a.ai_search_interest)}`);
  if (a.investing_marketing) lines.push(`Currently investing in SEO or digital marketing: ${say(a.investing_marketing)}`);
  if (a.specialist_interest) lines.push(`Wants to speak with a specialist: ${say(a.specialist_interest)}`);
  return lines;
}

// Every line says whether it was confirmed by the prospect. Nothing that the
// prospect did not state is presented as a verified request.
export function buildQualificationBriefLines(input: BriefQualificationInput): string[] {
  const a = input.answers;
  const confirmed = (value: string | null | undefined) => (value && value.trim() ? value.trim() : "Not stated by the prospect");
  const website =
    a.has_website === "no"
      ? "No website (confirmed by the prospect)"
      : a.has_website === "yes"
        ? (a.website_url || input.leadWebsite || "Has a website (address not recorded)")
        : "Not confirmed";
  const services = a.services_of_interest.length > 0 ? a.services_of_interest.map(serviceLabel).join(", ") : "None confirmed";
  const intent: string[] = [];
  if (a.interested_in_new_or_redesign && a.interested_in_new_or_redesign !== "unsure") intent.push(INTEREST_TEXT[a.interested_in_new_or_redesign]);
  if (a.needs_ecommerce === "yes") intent.push("E-commerce functionality");
  if (a.interested_in_seo === "yes") intent.push("Better search visibility / SEO");
  const header = input.verified ? "Qualification (confirmed with the prospect by the calling agent)" : "Qualification (NOT yet verified - treat as unconfirmed)";
  return [
    header,
    `Prospect: ${input.prospectName?.trim() || "Not provided"} - ${input.businessName}`,
    `Website: ${website}`,
    `Requested services: ${services}`,
    `Confirmed challenges: ${confirmed(a.challenges)}`,
    `Intended improvements: ${intent.length > 0 ? intent.join("; ") : "Not stated by the prospect"}${a.intended_improvements ? ` - ${a.intended_improvements}` : ""}`,
    `Qualification notes: ${confirmed(a.qualification_notes)}`,
    ...buildConfirmationBriefLines(a),
    ...buildMarketingBriefLines(a),
    `Appointment: ${input.appointmentDate} ${input.appointmentTime.slice(0, 5)} (${input.timezone})`,
    `Assigned agent: ${input.agentName?.trim() || "Not assigned"}`,
  ];
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
export type QcCallRow = { client_id: string; agent_id: string | null; contact_key: string };
export type QcQualificationRow = { client_id: string; agent_id: string | null; outcome: string; lead_gen_only?: boolean };
export type QcAppointmentRow = {
  id: string;
  client_id: string;
  agent_id: string | null;
  qc_status: string;
  status: string;
  qc_rejection_reason: string | null;
};
export type QcConversionRow = { appointment_id: string | null; conversion_status: string };

export type QcMetrics = {
  contacted: number;
  qualified: number;
  // Prospects screened out because they only wanted lead generation.
  leadGenOnly: number;
  submitted: number;
  approved: number;
  rejected: number;
  needsInfo: number;
  pending: number;
  completed: number;
  converted: number;
  rejectionReasons: Record<string, number>;
};
export type QcMetricsGroup = { clientId: string; clientName: string; totals: QcMetrics; agents: { agentId: string | null; agentName: string; metrics: QcMetrics }[] };

const emptyMetrics = (): QcMetrics => ({ contacted: 0, qualified: 0, leadGenOnly: 0, submitted: 0, approved: 0, rejected: 0, needsInfo: 0, pending: 0, completed: 0, converted: 0, rejectionReasons: {} });

const CONVERTED_STATUSES = ["converted_paid", "converted_payment_pending"];

export function buildQcMetrics(input: {
  clients: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  calls: QcCallRow[];
  qualifications: QcQualificationRow[];
  appointments: QcAppointmentRow[];
  conversions: QcConversionRow[];
}): QcMetricsGroup[] {
  const agentName = new Map(input.agents.map((a) => [a.id, a.name]));
  const convertedAppointmentIds = new Set(input.conversions.filter((c) => c.appointment_id && CONVERTED_STATUSES.includes(c.conversion_status)).map((c) => c.appointment_id as string));
  const buckets = new Map<string, Map<string | null, QcMetrics>>();
  const get = (clientId: string, agentId: string | null) => {
    let byAgent = buckets.get(clientId);
    if (!byAgent) buckets.set(clientId, (byAgent = new Map()));
    let m = byAgent.get(agentId);
    if (!m) byAgent.set(agentId, (m = emptyMetrics()));
    return m;
  };

  const seenContacts = new Set<string>();
  for (const call of input.calls) {
    const key = `${call.client_id}|${call.agent_id ?? ""}|${call.contact_key}`;
    if (seenContacts.has(key)) continue;
    seenContacts.add(key);
    get(call.client_id, call.agent_id).contacted += 1;
  }
  for (const q of input.qualifications) {
    if (q.outcome === "qualified") get(q.client_id, q.agent_id).qualified += 1;
    else if (q.outcome === "not_qualified" && q.lead_gen_only) get(q.client_id, q.agent_id).leadGenOnly += 1;
  }
  for (const a of input.appointments) {
    if (a.qc_status === "not_required") continue; // never went through review
    const m = get(a.client_id, a.agent_id);
    m.submitted += 1;
    if (a.qc_status === "approved") {
      m.approved += 1;
      if (a.status === "Completed") m.completed += 1;
      if (convertedAppointmentIds.has(a.id)) m.converted += 1;
    } else if (a.qc_status === "rejected") {
      m.rejected += 1;
      const bucket = rejectionReasonBucket(a.qc_rejection_reason);
      m.rejectionReasons[bucket] = (m.rejectionReasons[bucket] ?? 0) + 1;
    } else if (a.qc_status === "needs_info") m.needsInfo += 1;
    else if (a.qc_status === "pending_review") m.pending += 1;
  }

  const add = (target: QcMetrics, source: QcMetrics) => {
    for (const key of ["contacted", "qualified", "leadGenOnly", "submitted", "approved", "rejected", "needsInfo", "pending", "completed", "converted"] as const) target[key] += source[key];
    for (const [reason, n] of Object.entries(source.rejectionReasons)) target.rejectionReasons[reason] = (target.rejectionReasons[reason] ?? 0) + n;
  };

  return input.clients
    .filter((c) => buckets.has(c.id))
    .map((c) => {
      const byAgent = buckets.get(c.id)!;
      const totals = emptyMetrics();
      const agents = Array.from(byAgent.entries())
        .map(([agentId, metrics]) => {
          add(totals, metrics);
          return { agentId, agentName: agentId ? (agentName.get(agentId) ?? "Unknown agent") : "Unattributed", metrics };
        })
        .sort((x, y) => x.agentName.localeCompare(y.agentName));
      return { clientId: c.id, clientName: c.name, totals, agents };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export function acceptanceRate(m: Pick<QcMetrics, "approved" | "rejected">): number | null {
  const decided = m.approved + m.rejected;
  return decided === 0 ? null : Math.round((m.approved / decided) * 100);
}
