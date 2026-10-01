import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isHiddenLeadgenCampaignName, type LeadgenAppointmentRow, type LeadgenCampaignRow, type LeadgenClientRow, type LeadgenEmailRow, type LeadgenLeadRow, type LeadgenUserRow } from "@/lib/leadgen-types";
import {
  fetchLeadgenAppointmentReminderSettings,
  fetchLeadgenAppointmentReminderStatusMap,
  fetchLeadgenAppointmentSmsReminderStatusMap,
  fetchLeadgenImmediateConfirmationStatusMap,
  fetchLeadgenImmediateSmsConfirmationStatusMap,
} from "@/lib/leadgen-appointment-reminders";
import { fetchLeadgenBusinessAppointmentReminderStatusMap } from "@/lib/leadgen-business-appointment-reminders";
import { deriveFeedbackStatus, summarizePrep, type FeedbackStatus } from "@/lib/leadgen-appointment-prep";
import { fetchFeedbackRows, fetchPrepStatusMap } from "@/lib/leadgen-appointment-prep-data";
import AppointmentsListClient from "./AppointmentsListClient";

function clientFilterRows(rows: LeadgenAppointmentRow[], clientId: string | undefined): LeadgenAppointmentRow[] {
  return clientId ? rows.filter((r) => r.client_id === clientId) : rows;
}

const DEACTIVATED_TEST_AGENT_EMAIL = "test-agent@winsalotcorp.com";

export default async function LeadgenAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    highlight?: string;
    // Set by the admin dashboard's "Results by Client" table or a client
    // campaign dashboard (leadgen/admin/clients/[id]) via ?client=<id> -
    // pre-selects the Client filter and, paired with openAdd, the Book
    // Appointment form's own Client field.
    client?: string;
    openAdd?: string;
  }>;
}) {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { highlight, client, openAdd } = await searchParams;

  const [{ data: appointments }, { data: clients }, { data: campaigns }, { data: agents }, { data: leads }, { data: appointmentEmails }, reminderSettings] = await Promise.all([
    admin.from("leadgen_appointments").select("*").order("appointment_date", { ascending: false }),
    admin.from("leadgen_clients").select("*").order("name"),
    admin.from("leadgen_campaigns").select("*").order("name"),
    admin.from("leadgen_users").select("*").eq("role", "agent").eq("active", true).neq("email", DEACTIVATED_TEST_AGENT_EMAIL).order("full_name"),
    admin.from("leadgen_leads").select("id, business_name, client_id, campaign_id, contact_name, phone, email").order("business_name"),
    // Most recent leadgen_emails row per appointment - for the "Resend
    // Appointment Notification" / "Send Appointment Reminder" status
    // badge (brief: "Show the most recent appointment-email status to
    // both administrators and the assigned agent").
    admin.from("leadgen_emails").select("*").not("appointment_id", "is", null).order("created_at", { ascending: false }),
    fetchLeadgenAppointmentReminderSettings(admin),
  ]);

  const viewingClient = client ? (clients ?? []).find((c) => c.id === client) ?? null : null;

  const latestEmailByAppointmentId: Record<string, LeadgenEmailRow> = {};
  for (const email of appointmentEmails ?? []) {
    if (email.appointment_id && !(email.appointment_id in latestEmailByAppointmentId)) {
      latestEmailByAppointmentId[email.appointment_id] = email as LeadgenEmailRow;
    }
  }

  const appointmentRows = (appointments ?? []) as LeadgenAppointmentRow[];
  const [automaticReminderStatusByAppointmentId, businessReminderStatusByAppointmentId, smsReminderStatusByAppointmentId, confirmationStatusByAppointmentId, smsConfirmationStatusByAppointmentId] =
    await Promise.all([
      fetchLeadgenAppointmentReminderStatusMap(admin, appointmentRows),
      fetchLeadgenBusinessAppointmentReminderStatusMap(admin, appointmentRows),
      fetchLeadgenAppointmentSmsReminderStatusMap(admin, appointmentRows),
      fetchLeadgenImmediateConfirmationStatusMap(admin, appointmentRows),
      fetchLeadgenImmediateSmsConfirmationStatusMap(admin, appointmentRows),
    ]);

  // Agent name per card (brief: "Each appointment card must clearly show
  // ... Agent name") - resolved from the same active-agent roster the
  // "Assigned Specialist" dropdown already offers, so a historical
  // appointment assigned to a since-deactivated agent simply shows no
  // name, exactly like that dropdown would no longer offer them either.
  const agentNameById: Record<string, string> = {};
  for (const a of (agents ?? []) as LeadgenUserRow[]) {
    agentNameById[a.id] = a.full_name || a.email;
  }

  // Client Appointment Preparation: separate prep/feedback status per
  // appointment (never touches the appointment's own status).
  const [prepStatusByAppointmentId, feedbackRows] = await Promise.all([fetchPrepStatusMap(admin), fetchFeedbackRows(admin)]);
  const feedbackByAppointmentId = new Map(feedbackRows.map((f) => [f.appointment_id, f]));
  const feedbackStatusByAppointmentId: Record<string, FeedbackStatus> = {};
  for (const appt of appointmentRows) {
    const status = deriveFeedbackStatus(appt, feedbackByAppointmentId.get(appt.id));
    if (status) feedbackStatusByAppointmentId[appt.id] = status;
  }
  const prepSummary = summarizePrep(
    clientFilterRows(appointmentRows, client),
    prepStatusByAppointmentId
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
      <p className="mt-1 text-sm text-slate-500">Every consultation booked across every client.</p>

      <AppointmentsListClient
        appointments={(appointments ?? []) as LeadgenAppointmentRow[]}
        clients={(clients ?? []) as LeadgenClientRow[]}
        campaigns={((campaigns ?? []).filter((campaign) => !isHiddenLeadgenCampaignName(campaign.name))) as LeadgenCampaignRow[]}
        agents={(agents ?? []) as LeadgenUserRow[]}
        leads={(leads ?? []) as Pick<LeadgenLeadRow, "id" | "business_name" | "client_id" | "campaign_id" | "contact_name" | "phone" | "email">[]}
        latestEmailByAppointmentId={latestEmailByAppointmentId}
        automaticReminderStatusByAppointmentId={automaticReminderStatusByAppointmentId}
        businessReminderStatusByAppointmentId={businessReminderStatusByAppointmentId}
        smsReminderStatusByAppointmentId={smsReminderStatusByAppointmentId}
        confirmationStatusByAppointmentId={confirmationStatusByAppointmentId}
        smsConfirmationStatusByAppointmentId={smsConfirmationStatusByAppointmentId}
        agentNameById={agentNameById}
        prepStatusByAppointmentId={prepStatusByAppointmentId}
        feedbackStatusByAppointmentId={feedbackStatusByAppointmentId}
        prepSummary={prepSummary}
        reminderSettings={reminderSettings}
        highlightId={highlight}
        initialClientFilter={client}
        initialOpenAdd={openAdd === "1"}
        viewingClientName={viewingClient?.name ?? null}
      />
    </div>
  );
}
