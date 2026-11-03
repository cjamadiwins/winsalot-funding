import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildQcMetrics, evaluateQualifiable, type QcMetricsGroup, type QualificationAnswers } from "./leadgen-qualification";
import { rowToQualification, type QualificationRecord } from "./leadgen-appointment-qc";

// Reads for the Admin "Appointment Quality Control" page. Service-role client,
// called only after requireLeadgenAdmin().

// PostgREST caps a single response (1000 rows by default), so large tables are
// read in pages.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

export type QueueItem = {
  id: string;
  clientId: string;
  clientName: string;
  businessName: string;
  contactName: string | null;
  appointmentDate: string;
  appointmentTime: string;
  timezone: string;
  agentName: string | null;
  qcStatus: string;
  submittedAt: string | null;
  adminFeedback: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  leadId: string | null;
  qualification: QualificationRecord | null;
  approvedServices: string[];
  blockers: string[]; // why it cannot be approved yet (empty = approvable)
};

export type LegacyItem = {
  appointmentId: string;
  clientName: string;
  businessName: string;
  appointmentDate: string;
  status: string;
  agentName: string | null;
  reason: string;
  reviewStatus: string;
  adminNote: string | null;
  notes: string | null;
};

export type ClientSettingsItem = { clientId: string; clientName: string; enabled: boolean; approvedServices: string[]; notes: string | null; configured: boolean };

export type AppointmentQualityData = {
  queue: QueueItem[];
  recent: QueueItem[];
  legacy: LegacyItem[];
  metrics: QcMetricsGroup[];
  settings: ClientSettingsItem[];
  migrationMissing: boolean;
};

export async function loadAppointmentQualityData(admin: SupabaseClient): Promise<AppointmentQualityData> {
  const settingsProbe = await admin.from("leadgen_client_qualification_settings").select("client_id, enabled, approved_services, notes");
  if (settingsProbe.error) {
    // Migration not applied yet: show an empty, explanatory page rather than failing.
    return { queue: [], recent: [], legacy: [], metrics: [], settings: [], migrationMissing: true };
  }

  const [{ data: clients }, { data: users }] = await Promise.all([
    admin.from("leadgen_clients").select("id, name, active, is_internal_test").order("name"),
    admin.from("leadgen_users").select("id, full_name, email, role"),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));
  const userName = new Map((users ?? []).map((u) => [u.id as string, (u.full_name as string) || (u.email as string)]));
  const settingsByClient = new Map((settingsProbe.data ?? []).map((s) => [s.client_id as string, s]));

  const settings: ClientSettingsItem[] = (clients ?? [])
    .filter((c) => c.active && !c.is_internal_test)
    .map((c) => {
      const s = settingsByClient.get(c.id as string);
      return { clientId: c.id as string, clientName: c.name as string, enabled: Boolean(s?.enabled), approvedServices: (s?.approved_services as string[] | undefined) ?? [], notes: (s?.notes as string | null | undefined) ?? null, configured: Boolean(s) };
    });
  const gatedClientIds = new Set(settings.filter((s) => s.enabled).map((s) => s.clientId));

  const appointments = await fetchAll<Record<string, unknown>>((from, to) =>
    admin.from("leadgen_appointments").select("*").neq("qc_status", "not_required").order("created_at", { ascending: false }).range(from, to)
  );
  const qualificationIds = Array.from(new Set(appointments.map((a) => a.qualification_id as string | null).filter((v): v is string => Boolean(v))));
  const leadIds = Array.from(new Set(appointments.map((a) => a.lead_id as string | null).filter((v): v is string => Boolean(v))));
  const [qualRows, leadQualRows] = await Promise.all([
    qualificationIds.length ? admin.from("leadgen_lead_qualifications").select("*").in("id", qualificationIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    leadIds.length ? admin.from("leadgen_lead_qualifications").select("*").in("lead_id", leadIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const qualById = new Map((qualRows.data ?? []).map((q) => [q.id as string, rowToQualification(q as Record<string, unknown>)]));
  const qualByLead = new Map((leadQualRows.data ?? []).map((q) => [q.lead_id as string, rowToQualification(q as Record<string, unknown>)]));

  const toItem = (a: Record<string, unknown>): QueueItem => {
    const clientId = a.client_id as string;
    const approvedServices = (settingsByClient.get(clientId)?.approved_services as string[] | undefined) ?? [];
    const qualification = (a.qualification_id ? qualById.get(a.qualification_id as string) : null) ?? (a.lead_id ? qualByLead.get(a.lead_id as string) : null) ?? null;
    const blockers: string[] = [];
    if (!a.lead_id) blockers.push("Not linked to a lead, so it cannot be qualified.");
    else if (!qualification) blockers.push("No qualification on file. Request more qualification from the agent.");
    else {
      if (qualification.outcome !== "qualified") blockers.push("The qualification is not marked Qualified.");
      blockers.push(...evaluateQualifiable(qualification as QualificationAnswers, approvedServices).reasons);
    }
    return {
      id: a.id as string,
      clientId,
      clientName: clientName.get(clientId) ?? "Client",
      businessName: a.business_name as string,
      contactName: (a.contact_name as string | null) ?? null,
      appointmentDate: a.appointment_date as string,
      appointmentTime: a.appointment_time as string,
      timezone: a.timezone as string,
      agentName: userName.get((a.assigned_specialist_id as string) ?? (a.booking_agent_id as string)) ?? null,
      qcStatus: a.qc_status as string,
      submittedAt: (a.qc_submitted_at as string | null) ?? null,
      adminFeedback: (a.qc_admin_feedback as string | null) ?? null,
      rejectionReason: (a.qc_rejection_reason as string | null) ?? null,
      reviewedAt: (a.qc_reviewed_at as string | null) ?? null,
      leadId: (a.lead_id as string | null) ?? null,
      qualification,
      approvedServices,
      blockers,
    };
  };

  const items = appointments.map(toItem);
  const queue = items.filter((i) => i.qcStatus === "pending_review" || i.qcStatus === "needs_info").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const recent = items.filter((i) => i.qcStatus === "approved" || i.qcStatus === "rejected").slice(0, 40);

  // Legacy appointments flagged for review.
  const { data: flagRows } = await admin.from("leadgen_appointment_legacy_flags").select("*").order("flagged_at", { ascending: false });
  const flagged = flagRows ?? [];
  const flaggedApptIds = flagged.map((f) => f.appointment_id as string);
  const { data: flaggedAppts } = flaggedApptIds.length ? await admin.from("leadgen_appointments").select("id, business_name, appointment_date, status, appointment_notes, assigned_specialist_id, booking_agent_id").in("id", flaggedApptIds) : { data: [] };
  const apptById = new Map((flaggedAppts ?? []).map((a) => [a.id as string, a]));
  const legacy: LegacyItem[] = flagged
    .map((f) => {
      const a = apptById.get(f.appointment_id as string);
      if (!a) return null;
      return {
        appointmentId: f.appointment_id as string,
        clientName: clientName.get(f.client_id as string) ?? "Client",
        businessName: a.business_name as string,
        appointmentDate: a.appointment_date as string,
        status: a.status as string,
        agentName: userName.get((a.assigned_specialist_id as string) ?? (a.booking_agent_id as string)) ?? null,
        reason: f.reason as string,
        reviewStatus: f.review_status as string,
        adminNote: (f.admin_note as string | null) ?? null,
        notes: (a.appointment_notes as string | null) ?? null,
      } satisfies LegacyItem;
    })
    .filter((v): v is LegacyItem => v !== null);

  // Reporting, for the gated clients only.
  let metrics: QcMetricsGroup[] = [];
  if (gatedClientIds.size > 0) {
    const ids = Array.from(gatedClientIds);
    const [calls, quals, allAppts, conversions] = await Promise.all([
      fetchAll<Record<string, unknown>>((from, to) => admin.from("leadgen_call_logs").select("client_id, agent_id, call_list_lead_id, phone, business_name").in("client_id", ids).range(from, to)),
      fetchAll<Record<string, unknown>>((from, to) => admin.from("leadgen_lead_qualifications").select("client_id, agent_id, outcome").in("client_id", ids).range(from, to)),
      fetchAll<Record<string, unknown>>((from, to) => admin.from("leadgen_appointments").select("id, client_id, assigned_specialist_id, booking_agent_id, qc_status, status, qc_rejection_reason").in("client_id", ids).range(from, to)),
      fetchAll<Record<string, unknown>>((from, to) => admin.from("leadgen_conversions").select("appointment_id, conversion_status, client_id").in("client_id", ids).range(from, to)),
    ]);
    metrics = buildQcMetrics({
      clients: settings.filter((s) => s.enabled).map((s) => ({ id: s.clientId, name: s.clientName })),
      agents: (users ?? []).filter((u) => u.role === "agent").map((u) => ({ id: u.id as string, name: (u.full_name as string) || (u.email as string) })),
      calls: calls.map((c) => ({ client_id: c.client_id as string, agent_id: (c.agent_id as string | null) ?? null, contact_key: ((c.call_list_lead_id as string | null) ?? (c.phone as string | null) ?? (c.business_name as string | null) ?? "unknown").toString() })),
      qualifications: quals.map((q) => ({ client_id: q.client_id as string, agent_id: (q.agent_id as string | null) ?? null, outcome: q.outcome as string })),
      appointments: allAppts.map((a) => ({ id: a.id as string, client_id: a.client_id as string, agent_id: ((a.assigned_specialist_id as string | null) ?? (a.booking_agent_id as string | null)) ?? null, qc_status: (a.qc_status as string) ?? "not_required", status: a.status as string, qc_rejection_reason: (a.qc_rejection_reason as string | null) ?? null })),
      conversions: conversions.map((c) => ({ appointment_id: (c.appointment_id as string | null) ?? null, conversion_status: c.conversion_status as string })),
    });
  }

  return { queue, recent, legacy, metrics, settings, migrationMissing: false };
}
