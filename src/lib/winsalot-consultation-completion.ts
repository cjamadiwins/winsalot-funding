import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getResendClient } from "./resend";
import { getEmailSender, getEmailReplyTo } from "./email-senders";
import { LEADGEN_PRODUCTION_ORIGIN } from "./client-portal-shared";
import { buildWinsalotFollowUpEmail, type WinsalotEmailBody } from "./winsalot-consultation-emails";
import {
  winsalotFollowUpEmailDisplayStatus,
  winsalotFollowUpEmailErrorDetail,
  type WinsalotAppointmentRow,
  type WinsalotFollowUpEmailDisplayStatus,
} from "./winsalot-consultation-types";
import type { CrmLeadEmailRow } from "./crm-types";

// Resolves the "Go to My Client Dashboard" link for the follow-up email's
// CTA - only when this prospect's email matches an existing, `Active`
// Growth CRM client (crm_clients) that's actually linked to a Lead
// Generation CRM client with at least one active portal login
// (leadgen_users, role='client'). Every one of those has to hold, not
// just an Active crm_clients status: `/client/dashboard` itself is gated
// by requireLeadgenPortalClient() (src/lib/leadgen-auth.ts), so sending
// someone a dashboard link they can't actually log into would be worse
// than not sending one - a prospect who isn't fully provisioned yet
// always gets the reply-to fallback instead (see buildWinsalotFollowUpEmail).
// Read-only - never touches auth, permissions, or dashboard behavior.
//
// Built from LEADGEN_PRODUCTION_ORIGIN (https://leads.winsalotcorp.com),
// not this deployment's own getSiteUrl() - the client portal's session
// cookie (sb-leadgen-auth, src/lib/hosts.ts's authCookieName) is scoped to
// the Lead Gen CRM's own domain, so a client only ever actually signs in
// there, exactly like every other client-facing portal link in this
// codebase (client-portal-emails.ts's invite/reset links use this same
// origin) - never growth.winsalotcorp.com, even though this Growth CRM
// email is what triggers the send and /client/dashboard's page code also
// happens to live in this same repo.
async function resolveActiveClientDashboardLink(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data: client } = await admin
    .from("crm_clients")
    .select("leadgen_client_id")
    .ilike("email", email)
    .eq("status", "Active")
    .not("leadgen_client_id", "is", null)
    .limit(1)
    .maybeSingle();

  const leadgenClientId = client?.leadgen_client_id as string | undefined;
  if (!leadgenClientId) return null;

  const { data: portalUser } = await admin
    .from("leadgen_users")
    .select("id")
    .eq("client_id", leadgenClientId)
    .eq("role", "client")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  return portalUser ? `${LEADGEN_PRODUCTION_ORIGIN}/client/dashboard` : null;
}

// Builds the follow-up email's actual content for a given appointment -
// shared by the real send below and getWinsalotFollowUpEmailPreview, so
// "preview" can never show something different from what "send" actually
// sends.
async function buildFollowUpEmailForAppointment(admin: SupabaseClient, appt: WinsalotAppointmentRow): Promise<WinsalotEmailBody> {
  const clientDashboardUrl = await resolveActiveClientDashboardLink(admin, appt.email);
  return buildWinsalotFollowUpEmail({ contactName: appt.contact_name, clientDashboardUrl });
}

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
  // The linked opportunity, when there is one - callers use this to
  // revalidate that opportunity's own detail page (where the same
  // appointment is also shown, e.g. /admin/crm/opportunities/[id]'s
  // Appointments section) alongside the appointment management pages.
  opportunityId?: string | null;
};

export type WinsalotFollowUpSendResult = { status: "sent" | "failed"; error?: string };

// Sends the consultation follow-up email and records it - shared by both
// call sites:
//  - performWinsalotCompletion below, which only ever calls this once per
//    appointment (guarded by its own compare-and-swap update), for the
//    automatic "one time only" send.
//  - sendManualWinsalotFollowUpEmail, an explicit admin action that can
//    call this for any appointment in any status ("Send immediately" /
//    "Resend if necessary" / sending it anyway for a cancelled/no-show
//    consultation) - never automatic, always a deliberate click.
// Never throws - a send failure is recorded on the appointment row
// (follow_up_email_status = 'failed') and returned to the caller, but
// never rolls back a completion that already happened: the consultation
// did happen and was marked completed by a real staff action, and that
// fact must never be lost just because Resend/the network had a bad
// moment. actorName, when given, credits a manual send/resend in the
// activity note the same way the manual reminder/resend actions do.
export async function sendWinsalotFollowUpEmail(admin: SupabaseClient, appt: WinsalotAppointmentRow, actorName?: string): Promise<WinsalotFollowUpSendResult> {
  await admin.from("winsalot_appointments").update({ follow_up_email_status: "sending" }).eq("id", appt.id);

  const email = await buildFollowUpEmailForAppointment(admin, appt);

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
        notes: actorName ? `Consultation follow-up email sent to ${appt.email} by ${actorName}.` : `Consultation follow-up email sent to ${appt.email}.`,
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
    return {
      outcome: "already_completed",
      followUpEmailStatus: winsalotFollowUpEmailDisplayStatus(currentAppt.follow_up_email_status, null),
      opportunityId: currentAppt.opportunity_id,
    };
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
    const { data: recheck } = await admin
      .from("winsalot_appointments")
      .select("status, follow_up_email_status, opportunity_id")
      .eq("id", appointmentId)
      .maybeSingle();
    if (recheck?.status === "completed") {
      return {
        outcome: "already_completed",
        followUpEmailStatus: winsalotFollowUpEmailDisplayStatus(recheck.follow_up_email_status, null),
        opportunityId: recheck.opportunity_id as string | null,
      };
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
    opportunityId: appt.opportunity_id,
  };
}

export type WinsalotNoShowResult = { error?: string; opportunityId?: string | null };

// "Cancelled and No-Show consultations should not trigger the automatic
// [follow-up] email" - this action never calls sendWinsalotFollowUpEmail.
export async function performWinsalotNoShow(appointmentId: string, actor: WinsalotCompletionActor): Promise<WinsalotNoShowResult> {
  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  const appt = appointment as WinsalotAppointmentRow;

  if (appt.status === "completed") return { error: "This consultation was already marked completed." };
  if (appt.status === "cancelled") return { error: "This consultation was already cancelled." };
  if (appt.status === "no_show") return { opportunityId: appt.opportunity_id };

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

  return { opportunityId: appt.opportunity_id };
}

// ---------------------------------------------------------------------
// Manual "Send Follow-Up Email" (admin-only, from the consultation/
// appointment record) - "Send immediately", "Preview before sending",
// and "Resend if necessary" all go through these two functions. Neither
// is gated on the appointment's status: the automatic one-time send
// above only ever fires from a Completed transition, but an admin can
// deliberately send (or resend) this email for any consultation,
// including a cancelled or no-show one, exactly per the brief - "unless
// Admin manually chooses to send it." Authorization (requireCrmAdmin)
// lives in the Server Action that calls these, not here.
// ---------------------------------------------------------------------

export type WinsalotFollowUpPreviewResult = { subject: string; text: string; error?: undefined } | { error: string };

// Renders exactly what a send would send, without sending it or touching
// follow_up_email_status - a plain-text preview (not the HTML) is enough
// for an admin to sanity-check the content and confirm whether the
// dashboard button or the reply-to fallback will show.
export async function getWinsalotFollowUpEmailPreview(appointmentId: string): Promise<WinsalotFollowUpPreviewResult> {
  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!appointment) return { error: "Appointment not found." };

  const email = await buildFollowUpEmailForAppointment(admin, appointment as WinsalotAppointmentRow);
  return { subject: email.subject, text: email.text };
}

export async function sendManualWinsalotFollowUpEmail(appointmentId: string, actorName: string): Promise<WinsalotFollowUpSendResult & { error?: string }> {
  const admin = getSupabaseAdmin();
  const { data: appointment } = await admin.from("winsalot_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (!appointment) return { status: "failed", error: "Appointment not found." };

  return sendWinsalotFollowUpEmail(admin, appointment as WinsalotAppointmentRow, actorName);
}

export type WinsalotFollowUpStatusEntry = {
  followUpEmailStatus: WinsalotFollowUpEmailDisplayStatus;
  followUpEmailError: string | null;
  // The address the follow-up was actually sent to, from the tracked
  // crm_lead_emails row itself - not the appointment's current `email`
  // field, which could have been edited since the send. Null until a send
  // has actually happened (Not Sent).
  followUpEmailRecipient: string | null;
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
      followUpEmailRecipient: linkedEmail?.to_email ?? null,
    };
  }
  return result;
}
