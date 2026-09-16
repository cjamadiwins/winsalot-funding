import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { buildWinsalotFollowUpEmail } from "./winsalot-consultation-emails";
import {
  winsalotFollowUpEmailDisplayStatus,
  winsalotFollowUpEmailErrorDetail,
  type WinsalotAppointmentRow,
  type WinsalotFollowUpEmailDisplayStatus,
} from "./winsalot-consultation-types";
import type { CrmLeadEmailRow } from "./crm-types";

// "Complete Consultation" / "Mark No Show" - available to an admin or the
// assigned agent from the consultation/appointment management area
// (Growth CRM only). Both write through the service-role client, exactly
// like performWinsalotReschedule/performWinsalotCancellation in
// winsalot-consultation-book.ts - the caller (the admin or agent Server
// Action) is responsible for authorization/ownership, this module's job is
// only "is this a legal state transition, and if so, act on it exactly
// once."

export type WinsalotCompletionActor = { userId: string; name: string };

export type WinsalotCompletionResult = {
  error?: string;
  // "already_completed" means this call was a no-op (the appointment was
  // already Completed, most likely a duplicate click) - never an error,
  // and never a reason to resend the follow-up email.
  outcome?: "completed" | "already_completed";
  followUpEmailStatus?: WinsalotFollowUpEmailDisplayStatus;
};

// Trigger the one-time consultation follow-up email. Never throws - a
// send failure is recorded on the appointment row (follow_up_email_status
// = 'failed') and returned to the caller, but never rolls back the
// completion itself: the consultation did happen and was marked
// completed by a real staff action, and that fact must never be lost just
// because Resend/the network had a bad moment. Failure is retried
// automatically the next time the send is invoked... except this send is
// deliberately never retried automatically (per the brief: "trigger...
// automatically one time only"), so a failed follow-up email is a signal
// for staff to notice on the appointment record and resend manually as a
// separate action.
async function sendWinsalotFollowUpEmail(admin: SupabaseClient, appt: WinsalotAppointmentRow): Promise<{ status: "sent" | "failed"; error?: string }> {
  await admin.from("winsalot_appointments").update({ follow_up_email_status: "sending" }).eq("id", appt.id);

  const email = buildWinsalotFollowUpEmail({
    contactName: appt.contact_name,
    businessName: appt.business_name,
    serviceType: appt.service_type,
    appointmentType: appt.appointment_type,
    startUtcIso: appt.appointment_start_at,
    timezone: appt.prospect_timezone || appt.business_timezone,
  });

  try {
    const resend = getResendClient();
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: getEmailSender("growth"),
      to: appt.email,
      replyTo: getEmailReplyTo(),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (sendError || !sendResult) {
      const errorDetail = sendError?.message ?? "Unknown Resend error.";
      await admin.from("winsalot_appointments").update({ follow_up_email_status: "failed" }).eq("id", appt.id);
      return { status: "failed", error: errorDetail };
    }

    const sentAt = new Date().toISOString();
    let crmLeadEmailId: string | null = null;
    if (appt.opportunity_id) {
      const { data: tracked } = await admin
        .from("crm_lead_emails")
        .insert({
          opportunity_id: appt.opportunity_id,
          agent_id: appt.assigned_agent_id,
          resend_email_id: sendResult.id,
          email_type: "consultation_follow_up",
          to_email: appt.email,
          subject: email.subject,
          status: "sent",
          status_at: sentAt,
          sent_at: sentAt,
        })
        .select("id")
        .maybeSingle();
      crmLeadEmailId = (tracked?.id as string | undefined) ?? null;

      await admin.from("crm_activities").insert({
        opportunity_id: appt.opportunity_id,
        agent_id: appt.assigned_agent_id,
        activity_type: "email",
        notes: `Consultation follow-up email sent to ${appt.email}.`,
        occurred_at: sentAt,
      });
    }

    await admin
      .from("winsalot_appointments")
      .update({ follow_up_email_status: "sent", follow_up_email_sent_at: sentAt, follow_up_crm_lead_email_id: crmLeadEmailId })
      .eq("id", appt.id);

    return { status: "sent" };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : "Unknown error sending follow-up email.";
    await admin.from("winsalot_appointments").update({ follow_up_email_status: "failed" }).eq("id", appt.id);
    return { status: "failed", error: errorDetail };
  }
}

// "Change the consultation status to Completed. Record the completed
// date/time. Record who marked it completed. Trigger the follow-up email
// automatically one time only." The status transition is a guarded
// compare-and-swap (`.eq("status", "booked")`) rather than a plain
// update - the *database* is what actually guarantees "one time only",
// not just a disabled button in the UI: if this action fires twice
// (double-click, two tabs, two staff members), only the request that
// actually flips 'booked' -> 'completed' gets a row back from the update
// and goes on to send the email; every other request sees zero rows
// affected and returns the already-sent outcome without sending anything.
export async function performWinsalotCompletion(appointmentId: string, actor: WinsalotCompletionActor): Promise<WinsalotCompletionResult> {
  const admin = getSupabaseAdmin();

  const { data: current } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!current) return { error: "Appointment not found." };
  const currentAppt = current as WinsalotAppointmentRow;

  if (currentAppt.status === "completed") {
    return { outcome: "already_completed", followUpEmailStatus: winsalotFollowUpEmailDisplayStatus(currentAppt.follow_up_email_status, null) };
  }
  if (currentAppt.status === "cancelled") return { error: "This consultation was cancelled and cannot be marked completed." };
  if (currentAppt.status === "no_show") return { error: "This consultation was marked No Show and cannot be marked completed." };

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("winsalot_appointments")
    .update({
      status: "completed",
      completed_at: nowIso,
      completed_by_user_id: actor.userId,
      completed_by_name: actor.name,
      updated_at: nowIso,
    })
    .eq("id", appointmentId)
    .eq("status", "booked")
    .select("*")
    .maybeSingle();

  if (updateError) {
    console.error("[winsalot-consultations] failed to mark appointment completed:", updateError);
    return { error: "Failed to mark the consultation completed. Please try again." };
  }

  if (!updated) {
    // Raced with another completion (or a cancellation) between the read
    // above and this write.
    const { data: recheck } = await admin.from("winsalot_appointments").select("status, follow_up_email_status").eq("id", appointmentId).maybeSingle();
    if (recheck?.status === "completed") {
      return { outcome: "already_completed", followUpEmailStatus: winsalotFollowUpEmailDisplayStatus(recheck.follow_up_email_status, null) };
    }
    return { error: "This consultation is no longer in a state that can be marked completed." };
  }

  const appt = updated as WinsalotAppointmentRow;

  if (appt.opportunity_id) {
    await admin.from("crm_activities").insert({
      opportunity_id: appt.opportunity_id,
      agent_id: actor.userId,
      activity_type: "consultation_completed",
      notes: `Consultation marked Completed by ${actor.name}.`,
      occurred_at: nowIso,
    });
  }

  const followUp = await sendWinsalotFollowUpEmail(admin, appt);
  return {
    outcome: "completed",
    followUpEmailStatus: followUp.status === "sent" ? "Sent" : "Failed",
    error: followUp.status === "failed" ? `Consultation marked completed, but the follow-up email failed to send: ${followUp.error}` : undefined,
  };
}

export type WinsalotNoShowResult = { error?: string };

// "Cancelled and No-Show consultations should not trigger the automatic
// [follow-up] email" - this action never calls sendWinsalotFollowUpEmail.
export async function performWinsalotNoShow(appointmentId: string, actor: WinsalotCompletionActor): Promise<WinsalotNoShowResult> {
  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  const appt = appointment as WinsalotAppointmentRow;

  if (appt.status === "completed") return { error: "This consultation was already marked completed." };
  if (appt.status === "cancelled") return { error: "This consultation was already cancelled." };
  if (appt.status === "no_show") return {};

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("winsalot_appointments")
    .update({
      status: "no_show",
      no_show_at: nowIso,
      no_show_by_user_id: actor.userId,
      no_show_by_name: actor.name,
      updated_at: nowIso,
    })
    .eq("id", appointmentId)
    .eq("status", "booked");

  if (updateError) {
    console.error("[winsalot-consultations] failed to mark appointment no-show:", updateError);
    return { error: "Failed to mark the consultation No Show. Please try again." };
  }

  if (appt.opportunity_id) {
    await admin.from("crm_activities").insert({
      opportunity_id: appt.opportunity_id,
      agent_id: actor.userId,
      activity_type: "consultation_no_show",
      notes: `Consultation marked No Show by ${actor.name}.`,
      occurred_at: nowIso,
    });
  }

  return {};
}

export type WinsalotFollowUpStatusEntry = {
  followUpEmailStatus: WinsalotFollowUpEmailDisplayStatus;
  followUpEmailError: string | null;
};

// Display status for the admin/agent appointment list - mirrors
// fetchWinsalotReminderStatusMap's "prefer the tracked crm_lead_emails
// row's Resend-webhook status" pattern.
export async function fetchWinsalotFollowUpStatusMap(
  appointments: Pick<WinsalotAppointmentRow, "id" | "follow_up_email_status" | "follow_up_crm_lead_email_id">[]
): Promise<Record<string, WinsalotFollowUpStatusEntry>> {
  if (appointments.length === 0) return {};

  const admin = getSupabaseAdmin();
  const trackedEmailIds = appointments.map((a) => a.follow_up_crm_lead_email_id).filter((id): id is string => !!id);
  const { data: trackedEmailRows } = trackedEmailIds.length
    ? await admin.from("crm_lead_emails").select("*").in("id", trackedEmailIds)
    : { data: [] as CrmLeadEmailRow[] };
  const trackedEmailById = new Map(((trackedEmailRows ?? []) as CrmLeadEmailRow[]).map((email) => [email.id, email]));

  const result: Record<string, WinsalotFollowUpStatusEntry> = {};
  for (const appt of appointments) {
    const linkedEmail = appt.follow_up_crm_lead_email_id ? (trackedEmailById.get(appt.follow_up_crm_lead_email_id) ?? null) : null;
    result[appt.id] = {
      followUpEmailStatus: winsalotFollowUpEmailDisplayStatus(appt.follow_up_email_status, linkedEmail),
      followUpEmailError: winsalotFollowUpEmailErrorDetail(linkedEmail),
    };
  }
  return result;
}
