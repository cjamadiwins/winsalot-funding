import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeadgenAppointmentRow, LeadgenEmailRow } from "@/lib/leadgen-types";
import { fetchLeadgenAppointmentReminderStatusMap, fetchLeadgenAppointmentSmsReminderStatusMap } from "@/lib/leadgen-appointment-reminders";
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

  const automaticReminderStatusByAppointmentId = await fetchLeadgenAppointmentReminderStatusMap(supabase, rows);
  const businessReminderStatusByAppointmentId = await fetchLeadgenBusinessAppointmentReminderStatusMap(supabase, rows);
  const smsReminderStatusByAppointmentId = await fetchLeadgenAppointmentSmsReminderStatusMap(supabase, rows);

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
        initialClientFilter={client}
        viewingClientName={viewingClient?.name ?? null}
      />
    </div>
  );
}
