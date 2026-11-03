import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { isValidMobileNumber, sendImmediateAppointmentConfirmation } from "./appointment-sms";
import { zonedWallTimeToUtcMs } from "./leadgen-appointment-reminders";
import { notifyOfNewLeadgenAppointment } from "./leadgen-appointment-notifications";
import type { LeadgenAppointmentRow, LeadgenClientRow } from "./leadgen-types";
import { preliminaryCategoryFromLead, buildQualificationBriefLines, evaluateQualifiable, isClientNotifiable, normalizeAnswers, type QualificationAnswers, type QualificationOutcome, type QualificationCategory } from "./leadgen-qualification";

// Server-side helpers for the client-qualification / appointment-approval
// feature. Every function degrades to "no gate" when the feature's tables or
// columns do not exist yet, so this code can be deployed before (or together
// with) the migration without breaking any booking flow.

export type QualificationSettings = { client_id: string; enabled: boolean; approved_services: string[]; notes: string | null };

export type QualificationRecord = QualificationAnswers & {
  id: string;
  lead_id: string;
  client_id: string;
  campaign_id: string | null;
  agent_id: string | null;
  category: QualificationCategory | null;
  category_source: "auto_preliminary" | "agent_verified";
  outcome: QualificationOutcome;
  submitted_at: string | null;
  updated_at: string;
};

export async function fetchQualificationSettings(supabase: SupabaseClient, clientId: string): Promise<QualificationSettings | null> {
  const { data, error } = await supabase.from("leadgen_client_qualification_settings").select("client_id, enabled, approved_services, notes").eq("client_id", clientId).maybeSingle();
  if (error || !data) return null;
  return { client_id: data.client_id as string, enabled: Boolean(data.enabled), approved_services: (data.approved_services as string[] | null) ?? [], notes: (data.notes as string | null) ?? null };
}

export function rowToQualification(row: Record<string, unknown>): QualificationRecord {
  const answers = normalizeAnswers(row as Partial<Record<keyof QualificationAnswers, unknown>>);
  return {
    ...answers,
    // normalizeAnswers drops values it cannot validate; keep the stored booleans exactly.
    understands_services: (row.understands_services as boolean | null) ?? null,
    agreed_to_appointment: (row.agreed_to_appointment as boolean | null) ?? null,
    id: row.id as string,
    lead_id: row.lead_id as string,
    client_id: row.client_id as string,
    campaign_id: (row.campaign_id as string | null) ?? null,
    agent_id: (row.agent_id as string | null) ?? null,
    category: (row.category as QualificationCategory | null) ?? null,
    category_source: (row.category_source as "auto_preliminary" | "agent_verified") ?? "auto_preliminary",
    outcome: (row.outcome as QualificationOutcome) ?? "draft",
    submitted_at: (row.submitted_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  };
}

export async function fetchQualificationForLead(supabase: SupabaseClient, leadId: string): Promise<QualificationRecord | null> {
  const { data, error } = await supabase.from("leadgen_lead_qualifications").select("*").eq("lead_id", leadId).maybeSingle();
  if (error || !data) return null;
  return rowToQualification(data as Record<string, unknown>);
}

export type BookingGate =
  | { required: false }
  | { required: true; ok: true; qualificationId: string }
  | { required: true; ok: false; error: string };

// Backend rule for every booking path: for a gated client the appointment may
// only be submitted when the lead has a recorded 'qualified' qualification that
// still meets every rule against the client's CURRENT approved services.
export async function checkQualificationForBooking(supabase: SupabaseClient, input: { clientId: string; leadId: string | null }): Promise<BookingGate> {
  const settings = await fetchQualificationSettings(getSupabaseAdmin(), input.clientId);
  if (!settings?.enabled) return { required: false };
  if (!input.leadId) {
    return { required: true, ok: false, error: "This client requires a recorded qualification before an appointment can be submitted. Book from the lead's page so the qualification can be saved first." };
  }
  const qualification = await fetchQualificationForLead(supabase, input.leadId);
  if (!qualification) return { required: true, ok: false, error: "Complete and save the qualification questions for this lead before submitting an appointment." };
  if (qualification.outcome !== "qualified") {
    return { required: true, ok: false, error: "The saved qualification is not marked Qualified. Finish the qualification first - appointments are only accepted for prospects who confirmed interest in one of this client's services." };
  }
  const result = evaluateQualifiable(qualification, settings.approved_services);
  if (!result.ok) return { required: true, ok: false, error: `The qualification no longer meets this client's requirements: ${result.reasons.join(" ")}` };
  return { required: true, ok: true, qualificationId: qualification.id };
}

// Timeline entries the client's activity feed mirrors (e.g. "appointment_updated")
// are written as internal notes while the appointment awaits approval, so the
// client never learns about an appointment that has not been approved.
export async function appointmentActivityType(admin: SupabaseClient, appointmentId: string, type: string): Promise<string> {
  return (await isAwaitingApproval(admin, appointmentId)) ? "note" : type;
}

export async function getAppointmentQcStatus(admin: SupabaseClient, appointmentId: string): Promise<string | null> {
  const { data, error } = await admin.from("leadgen_appointments").select("qc_status").eq("id", appointmentId).maybeSingle();
  if (error || !data) return null; // column missing (migration not applied) or row gone -> no gate
  return (data.qc_status as string | null) ?? null;
}

// True while an appointment must NOT trigger any client- or prospect-facing
// message (new-appointment notices, confirmations, reminders, briefs).
export async function isAwaitingApproval(admin: SupabaseClient, appointmentId: string): Promise<boolean> {
  return !isClientNotifiable(await getAppointmentQcStatus(admin, appointmentId));
}

// Runs once, when Admin approves: the notifications that were held back at
// booking time (prospect confirmation SMS, client + prospect emails, client SMS,
// internal summary). Reuses the existing senders unchanged. The existing
// admin_notified_at claim inside notifyOfNewLeadgenAppointment makes a second
// call a no-op.
export async function releaseHeldAppointmentNotifications(appointmentId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: row } = await admin.from("leadgen_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!row) return;
  const appt = row as LeadgenAppointmentRow;
  if (!isClientNotifiable((row as { qc_status?: string }).qc_status)) return; // never release unless approved
  const [{ data: client }, { data: agent }] = await Promise.all([
    admin.from("leadgen_clients").select("id, name, contact_name, contact_email, appointment_notification_emails, sms_notification_number").eq("id", appt.client_id).maybeSingle(),
    appt.assigned_specialist_id ? admin.from("leadgen_users").select("full_name, email").eq("id", appt.assigned_specialist_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!client) return;
  const clientRow = client as Pick<LeadgenClientRow, "id" | "name" | "contact_name" | "contact_email" | "appointment_notification_emails" | "sms_notification_number">;

  // The client-visible booking record that was held back at booking time.
  if (appt.lead_id) {
    await admin.from("leadgen_leads").update({ status: "Appointment booked" }).eq("id", appt.lead_id);
    await admin.from("leadgen_lead_activities").insert({
      lead_id: appt.lead_id,
      agent_id: null,
      activity_type: "appointment_booked",
      call_outcome: "Appointment booked",
      notes: `Appointment for ${appt.appointment_date} ${appt.appointment_time.slice(0, 5)} (${appt.timezone}) approved by Admin.`,
    });
  }

  await sendImmediateAppointmentConfirmation(admin, {
    table: "leadgen_appointment_sms_reminders",
    appointmentId: appt.id,
    leadId: appt.lead_id,
    scheduledAppointmentAtIso: new Date(zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone)).toISOString(),
    timezone: appt.timezone,
    prospectPhone: appt.phone,
    prospectConsent: isValidMobileNumber(appt.phone),
    businessName: clientRow.name ?? "our team",
  });
  const agentRow = agent as { full_name: string | null; email: string } | null;
  await notifyOfNewLeadgenAppointment(appt, clientRow, agentRow?.full_name || agentRow?.email || null);
}

// The "Qualification" section of the appointment preparation brief, built from
// what the agent recorded. Returns null when the appointment has no
// qualification (older appointments, or clients without the gate). A section
// is marked verified only for a Qualified outcome on an approved appointment;
// anything else is labelled unconfirmed so it is never presented as a verified
// prospect request.
export async function loadQualificationBriefLines(admin: SupabaseClient, appointment: LeadgenAppointmentRow): Promise<string[] | null> {
  let qualification: QualificationRecord | null = null;
  if (appointment.qualification_id) {
    const { data } = await admin.from("leadgen_lead_qualifications").select("*").eq("id", appointment.qualification_id).maybeSingle();
    if (data) qualification = rowToQualification(data as Record<string, unknown>);
  }
  if (!qualification && appointment.lead_id) qualification = await fetchQualificationForLead(admin, appointment.lead_id);
  if (!qualification) return null;
  const [{ data: lead }, { data: agent }] = await Promise.all([
    appointment.lead_id ? admin.from("leadgen_leads").select("website").eq("id", appointment.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    appointment.assigned_specialist_id ? admin.from("leadgen_users").select("full_name").eq("id", appointment.assigned_specialist_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return buildQualificationBriefLines({
    answers: qualification,
    verified: qualification.outcome === "qualified" && appointment.qc_status === "approved",
    prospectName: appointment.contact_name,
    businessName: appointment.business_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
    timezone: appointment.timezone,
    agentName: (agent as { full_name: string } | null)?.full_name ?? null,
    leadWebsite: (lead as { website: string | null } | null)?.website ?? null,
  });
}

export type QualificationPanelAppointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  qc_status: string;
  qc_admin_feedback: string | null;
  qc_rejection_reason: string | null;
};
export type QualificationPanelData = {
  settings: QualificationSettings;
  qualification: QualificationRecord | null;
  preliminaryCategory: QualificationCategory;
  appointments: QualificationPanelAppointment[];
};

// Everything the lead-page qualification card needs. Null when the client has
// no qualification settings (card hidden). Reads through the caller's own
// session client so RLS decides what an agent can see.
export async function loadQualificationPanelData(supabase: SupabaseClient, lead: { id: string; client_id: string; website: string | null }): Promise<QualificationPanelData | null> {
  const settings = await fetchQualificationSettings(supabase, lead.client_id);
  if (!settings?.enabled) return null;
  const [qualification, { data: appointments }] = await Promise.all([
    fetchQualificationForLead(supabase, lead.id),
    supabase.from("leadgen_appointments").select("id, appointment_date, appointment_time, qc_status, qc_admin_feedback, qc_rejection_reason").eq("lead_id", lead.id).neq("qc_status", "not_required").order("appointment_date", { ascending: false }),
  ]);
  return {
    settings,
    qualification,
    preliminaryCategory: preliminaryCategoryFromLead(lead.website),
    appointments: (appointments ?? []) as QualificationPanelAppointment[],
  };
}
