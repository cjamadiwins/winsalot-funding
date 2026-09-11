import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenAppointmentRow, LeadgenEmailRow } from "@/lib/leadgen-types";
import {
  fetchLeadgenAppointmentReminderStatusMap,
  fetchLeadgenAppointmentSmsReminderStatusMap,
  fetchLeadgenImmediateConfirmationStatusMap,
  fetchLeadgenImmediateSmsConfirmationStatusMap,
} from "@/lib/leadgen-appointment-reminders";
import { fetchLeadgenBusinessAppointmentReminderStatusMap } from "@/lib/leadgen-business-appointment-reminders";
import AgentAppointmentsListClient from "./AgentAppointmentsListClient";

export default async function LeadgenAgentAppointmentsPage({
  searchParams,
}: {
  // Set by the agent dashboard's "My Results by Client" section.
  searchParams: Promise<{ client?: string }>;
}) {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { client } = await searchParams;
  const { data: appointments } = await supabase
    .from("leadgen_appointments")
    .select("*")
    .order("appointment_date", { ascending: false });

  const rows = (appointments ?? []) as LeadgenAppointmentRow[];
  const leadIds = Array.from(new Set(rows.map((appt) => appt.lead_id).filter((id): id is string => !!id)));

  const [{ data: leads }, { data: appointmentEmails }, { data: clients }] = await Promise.all([
    leadIds.length
      ? supabase.from("leadgen_leads").select("id, email, contact_name").in("id", leadIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; contact_name: string | null }[] }),
    // RLS (leadgen_emails_agent_select_own) already scopes this to
    // emails this agent sent or that belong to a lead assigned to them -
    // for the "most recent appointment-email status" badge (brief: "Show
    // the most recent appointment-email status to both administrators
    // and the assigned agent").
    supabase.from("leadgen_emails").select("*").not("appointment_id", "is", null).order("created_at", { ascending: false }),
    supabase.from("leadgen_clients").select("id, name"),
  ]);
  const viewingClient = client ? (clients ?? []).find((c) => c.id === client) ?? null : null;

  const leadContactByLeadId: Record<string, { email: string | null; contact_name: string | null }> = {};
  for (const lead of leads ?? []) {
    leadContactByLeadId[lead.id] = { email: lead.email, contact_name: lead.contact_name };
  }

  const latestEmailByAppointmentId: Record<string, LeadgenEmailRow> = {};
  for (const email of appointmentEmails ?? []) {
    if (email.appointment_id && !(email.appointment_id in latestEmailByAppointmentId)) {
      latestEmailByAppointmentId[email.appointment_id] = email as LeadgenEmailRow;
    }
  }

  const [automaticReminderStatusByAppointmentId, businessReminderStatusByAppointmentId, smsReminderStatusByAppointmentId, confirmationStatusByAppointmentId, smsConfirmationStatusByAppointmentId] =
    await Promise.all([
      fetchLeadgenAppointmentReminderStatusMap(supabase, rows),
      fetchLeadgenBusinessAppointmentReminderStatusMap(supabase, rows),
      fetchLeadgenAppointmentSmsReminderStatusMap(supabase, rows),
      fetchLeadgenImmediateConfirmationStatusMap(supabase, rows),
      fetchLeadgenImmediateSmsConfirmationStatusMap(supabase, rows),
    ]);

  // Agent name per card (brief: "Each appointment card must clearly show
  // ... Agent name") - an agent's own RLS (leadgen_users_select_self)
  // can only read their own row, so a colleague specialist's name (for
  // an appointment visible here via a shared lead, not this agent's own
  // assignment) is resolved via the service-role client instead - this
  // only enriches appointments already authorized above with a name, it
  // never widens which appointments this agent can see.
  const specialistIds = Array.from(new Set(rows.map((a) => a.assigned_specialist_id).filter((id): id is string => !!id)));
  const { data: specialists } = specialistIds.length
    ? await getSupabaseAdmin().from("leadgen_users").select("id, full_name, email").in("id", specialistIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };
  const agentNameById: Record<string, string> = {};
  for (const s of specialists ?? []) {
    agentNameById[s.id] = s.full_name || s.email;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">
        Consultations you&apos;re the specialist for, or booked for a lead assigned to you. Book a new one from the
        lead&apos;s profile.
      </p>

      <AgentAppointmentsListClient
        appointments={rows}
        clients={(clients ?? []) as { id: string; name: string }[]}
        leadContactByLeadId={leadContactByLeadId}
        latestEmailByAppointmentId={latestEmailByAppointmentId}
        automaticReminderStatusByAppointmentId={automaticReminderStatusByAppointmentId}
        businessReminderStatusByAppointmentId={businessReminderStatusByAppointmentId}
        smsReminderStatusByAppointmentId={smsReminderStatusByAppointmentId}
        confirmationStatusByAppointmentId={confirmationStatusByAppointmentId}
        smsConfirmationStatusByAppointmentId={smsConfirmationStatusByAppointmentId}
        agentNameById={agentNameById}
        initialClientFilter={client}
        viewingClientName={viewingClient?.name ?? null}
      />
    </div>
  );
}
