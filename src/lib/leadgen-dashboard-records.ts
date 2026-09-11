// Lead Generation CRM dashboard drill-down cards - the Lead Gen
// equivalent of crm-dashboard-records.ts. Each card's displayed count and
// its modal's rows are always derived from filtering/sorting THIS SAME
// enriched array, so a card's number can never drift from what clicking
// it shows.
import { leadgenEmailStatusAt, type LeadgenAppointmentRow, type LeadgenEmailRow, type LeadgenEmailStatus, type LeadgenFollowUpRow, type LeadgenLeadRow } from "./leadgen-types";
import type { LeadgenOpportunityScoreRow } from "./opportunity-finder";
// Pulls in "server-only" transitively (leadgen-appointment-reminders.ts) -
// this module's runtime functions (buildAppointmentCardRecords,
// sortAppointmentsUpcomingFirst) are only ever called from the Server
// Component dashboard pages, which already pass pre-sorted, pre-enriched
// arrays down to the client drill-down modals; those modals only ever
// import this module's *types*, never its functions, so this stays safe.
import { zonedWallTimeToUtcMs } from "./leadgen-appointment-reminders";

// Only the columns the drill-down modal and the enrichment below actually
// need - lets each dashboard page keep its own existing, narrower
// `leadgen_leads` select (just adding `contact_name`/`notes`) instead of
// switching to `select("*")`.
export type LeadCardSource = Pick<
  LeadgenLeadRow,
  "id" | "business_name" | "contact_name" | "phone" | "email" | "status" | "assigned_agent_id" | "last_contacted_at" | "next_follow_up_at" | "notes"
>;

export type LeadCardRecord = LeadCardSource & {
  agentName: string | null;
  // From leadgen_opportunity_scores.signals when a score row exists yet
  // (same signals the Smart Opportunities modal already reads) - falls
  // back to null rather than the free-form `notes` field, which is a
  // distinct concept (see latestNote below).
  lastCallOutcome: string | null;
  // signals.last_note_summary when available, otherwise the lead's own
  // `notes` field - same fallback used for the Growth CRM's equivalent.
  latestNote: string | null;
  // The earliest pending leadgen_followups row for this lead, if any -
  // the same row Complete Follow-Up acts on everywhere else in the CRM.
  followUpId: string | null;
  // "Latest Email Activity" card (distinct from Last Contact, which never
  // counts an email alone) - the most recent leadgen_emails row addressed
  // to this lead, if any. Growth CRM gets the equivalent for free via
  // crm_opportunities.last_email_status/_status_at/_to, already
  // denormalized onto the row; leadgen_leads has no such columns, so this
  // is resolved from a fresh batch of leadgen_emails rows instead (see
  // latestLeadgenEmailByLeadId below).
  lastEmailStatus: LeadgenEmailStatus | null;
  lastEmailAt: string | null;
  lastEmailTo: string | null;
};

// One reduction, reused by both buildLeadCardRecords below and each
// dashboard's own Smart Opportunities row-building - the most recent
// leadgen_emails row per lead_id, by leadgenEmailStatusAt (the same
// "latest status-change timestamp" the Communications UI already uses).
export function latestLeadgenEmailByLeadId(
  emails: Pick<
    LeadgenEmailRow,
    "lead_id" | "status" | "to_email" | "sent_at" | "delivered_at" | "delayed_at" | "bounced_at" | "complained_at" | "opened_at" | "clicked_at" | "failed_at" | "created_at"
  >[]
): Map<string, { status: LeadgenEmailStatus; to_email: string; statusAt: string }> {
  const result = new Map<string, { status: LeadgenEmailStatus; to_email: string; statusAt: string }>();
  for (const email of emails) {
    if (!email.lead_id) continue;
    const statusAt = leadgenEmailStatusAt(email as LeadgenEmailRow);
    const current = result.get(email.lead_id);
    if (!current || new Date(statusAt).getTime() > new Date(current.statusAt).getTime()) {
      result.set(email.lead_id, { status: email.status, to_email: email.to_email, statusAt });
    }
  }
  return result;
}

export function buildLeadCardRecords(
  leads: LeadCardSource[],
  options: {
    scores?: Pick<LeadgenOpportunityScoreRow, "lead_id" | "signals">[];
    followUps?: Pick<LeadgenFollowUpRow, "id" | "lead_id" | "status" | "scheduled_at">[];
    agentNameById?: Map<string, string>;
    latestEmailByLeadId?: Map<string, { status: LeadgenEmailStatus; to_email: string; statusAt: string }>;
  } = {}
): LeadCardRecord[] {
  const { scores = [], followUps = [], agentNameById = new Map<string, string>(), latestEmailByLeadId = new Map() } = options;

  const signalsByLeadId = new Map<string, { last_call_outcome?: string | null; last_note_summary?: string | null }>();
  for (const score of scores) {
    signalsByLeadId.set(score.lead_id, score.signals as { last_call_outcome?: string | null; last_note_summary?: string | null });
  }

  // Earliest pending follow-up per lead, same reduction already done
  // separately on both dashboards.
  const pendingSortedAscending = followUps
    .filter((followUp) => followUp.status === "pending")
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const earliestFollowUpIdByLead = new Map<string, string>();
  for (const followUp of pendingSortedAscending) {
    if (!earliestFollowUpIdByLead.has(followUp.lead_id)) {
      earliestFollowUpIdByLead.set(followUp.lead_id, followUp.id);
    }
  }

  return leads.map((lead) => {
    const signals = signalsByLeadId.get(lead.id);
    const latestEmail = latestEmailByLeadId.get(lead.id);
    return {
      ...lead,
      agentName: lead.assigned_agent_id ? (agentNameById.get(lead.assigned_agent_id) ?? "Unassigned") : "Unassigned",
      lastCallOutcome: signals?.last_call_outcome ?? null,
      latestNote: signals?.last_note_summary ?? lead.notes,
      followUpId: earliestFollowUpIdByLead.get(lead.id) ?? null,
      lastEmailStatus: latestEmail?.status ?? null,
      lastEmailAt: latestEmail?.statusAt ?? null,
      lastEmailTo: latestEmail?.to_email ?? null,
    };
  });
}

// "Most urgent first" (Follow-Ups Due / Overdue cards) - earliest due
// timestamp first, so an overdue-by-three-days lead always sorts ahead of
// one due later today.
export function sortLeadsByMostUrgentFollowUp(records: LeadCardRecord[]): LeadCardRecord[] {
  return records.slice().sort((a, b) => {
    const aTime = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Infinity;
    const bTime = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Infinity;
    return aTime - bTime;
  });
}

// Root-cause fix for the Lead Gen "Appointments Booked" card: it used to
// count every appointment row whose status wasn't Cancelled/Replaced
// (isLeadgenAppointmentCountable - Booked, Confirmed, Completed, No-show,
// AND Rescheduled all counted), while clicking it filtered the Leads page
// to only leads whose most-recent appointment was status exactly
// "Booked" - two different definitions, and the KPI counted appointment
// *rows* while the destination counted *leads* (one per lead, most-recent
// appointment only), so a lead with two countable appointments was
// double-counted on the card but shown once on the destination. This is
// the one place "how many appointments are actually booked right now" is
// computed: status === "Booked" exactly, one row per appointment, for
// both the card count and its drill-down modal.
// Only the columns the appointment drill-down modal needs - lets the
// admin dashboard's existing `leadgen_appointments` select just add a few
// columns instead of switching to `select("*")`.
export type AppointmentCardSource = Pick<
  LeadgenAppointmentRow,
  | "id"
  | "business_name"
  | "contact_name"
  | "phone"
  | "email"
  | "appointment_date"
  | "appointment_time"
  | "timezone"
  | "meeting_type"
  | "appointment_notes"
  | "status"
  | "lead_id"
  | "assigned_specialist_id"
>;

export type AppointmentCardRecord = AppointmentCardSource & {
  agentName: string | null;
  // Precomputed here (server-side only - zonedWallTimeToUtcMs pulls in
  // "server-only") so the client modal never needs to redo the
  // date+time+timezone conversion itself, just format this timestamp.
  startAtMs: number;
};

export function buildAppointmentCardRecords(
  appointments: AppointmentCardSource[],
  agentNameById: Map<string, string>
): AppointmentCardRecord[] {
  return appointments.map((appointment) => ({
    ...appointment,
    agentName: appointment.assigned_specialist_id ? (agentNameById.get(appointment.assigned_specialist_id) ?? "Unassigned") : "Unassigned",
    startAtMs: zonedWallTimeToUtcMs(appointment.appointment_date, appointment.appointment_time, appointment.timezone),
  }));
}

// "Upcoming appointments first" - soonest-first among appointments still
// ahead of now, then anything already past its start time (booked but not
// yet updated) most-recent-first after that - same rule as the Growth
// CRM's sortConsultationsUpcomingFirst.
export function sortAppointmentsUpcomingFirst(records: AppointmentCardRecord[]): AppointmentCardRecord[] {
  const now = Date.now();
  return records.slice().sort((a, b) => {
    const aUpcoming = a.startAtMs >= now;
    const bUpcoming = b.startAtMs >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? a.startAtMs - b.startAtMs : b.startAtMs - a.startAtMs;
  });
}
