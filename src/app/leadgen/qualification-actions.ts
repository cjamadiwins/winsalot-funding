"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenAdmin, requireLeadgenUser } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  QUALIFICATION_CATEGORY_LABELS,
  classifyFromAnswers,
  composeRejectionReason,
  customServiceKey,
  evaluateQualifiable,
  isLegacyQualification,
  isValidServiceKey,
  GOOGLE_MARKETING_FIELDS,
  normalizeAnswers,
  type QualificationAnswers,
  type QualificationOutcome,
} from "@/lib/leadgen-qualification";
import { fetchQualificationForLead, fetchQualificationSettings, releaseHeldAppointmentNotifications } from "@/lib/leadgen-appointment-qc";
import { notifyOfNewLeadgenAppointment } from "@/lib/leadgen-appointment-notifications";
import type { LeadgenAppointmentRow, LeadgenClientRow } from "@/lib/leadgen-types";

type ActionResult = { error?: string; message?: string };

// Friendly text for the database's own rule violations (the triggers are the
// source of truth; the checks below just give earlier, clearer feedback).
function friendlyDbError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (message.includes("qualification_locked")) return "An approved appointment depends on this qualification, so only Admin can change it now.";
  if (message.includes("qualification_not_allowed")) return "A prospect who wants lead generation only cannot be marked Qualified.";
  if (message.includes("qualification_incomplete")) return "The qualification is incomplete: answer every question, confirm the prospect understands and agreed, and pick a service this client offers.";
  if (message.includes("qualification_invalid_service")) return "One of the selected services is not valid.";
  if (message.includes("qc_not_qualified")) return "This appointment has no complete, qualified qualification, so it cannot be approved.";
  if (message.includes("qc_reviewer_required")) return "Only an Admin can approve an appointment.";
  if (message.includes("qc_reason_required")) return "A rejection reason is required.";
  if (message.includes("qc_feedback_required")) return "Tell the agent what to qualify further.";
  if (message.includes("qc_invalid_transition")) return "This appointment has already been decided or is not in a state that allows that action. Refresh the page.";
  if (message.includes("qc_forbidden")) return "Only Admin can change an appointment's review state.";
  return fallback;
}

export type SaveQualificationInput = {
  leadId: string;
  answers: Partial<Record<keyof QualificationAnswers, unknown>>;
  // 'draft' keeps the answers without claiming an outcome.
  outcome: QualificationOutcome;
  // Autosave of a clicked answer: no history entry is written for it. It never
  // creates or changes an appointment either way.
  quiet?: boolean;
};

// Agents save for leads assigned to them (enforced by RLS and re-checked
// here); Admin can save for any lead. Nothing on the lead itself changes.
export async function saveQualificationAction(input: SaveQualificationInput): Promise<ActionResult & { outcome?: QualificationOutcome; categoryLabel?: string }> {
  const user = await requireLeadgenUser();
  if (user.role !== "agent" && user.role !== "admin") return { error: "Not allowed." };

  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase.from("leadgen_leads").select("id, client_id, campaign_id, assigned_agent_id, business_name").eq("id", input.leadId).maybeSingle();
  if (!lead) return { error: "Lead not found." };
  if (user.role === "agent" && lead.assigned_agent_id !== user.id) return { error: "This lead is not assigned to you." };

  const settings = await fetchQualificationSettings(getSupabaseAdmin(), lead.client_id as string);
  if (!settings) return { error: "Qualification is not set up for this client yet. Ask Admin to configure the client's approved services." };

  const approved = new Set(settings.approved_services);
  const answers = normalizeAnswers(input.answers);
  // Only services this client has approved can be recorded as the prospect's interest.
  answers.services_of_interest = answers.services_of_interest.filter((s) => approved.has(s));
  if (answers.has_website !== "yes") answers.website_url = null;

  const outcome = (["draft", "qualified", "requires_further_qualification", "not_qualified"] as const).includes(input.outcome) ? input.outcome : "draft";
  if (outcome === "qualified") {
    const check = evaluateQualifiable(answers, settings.approved_services);
    if (!check.ok) return { error: check.reasons.join(" ") };
  }
  // A prospect who wants lead generation only can never be Qualified.
  const finalOutcome: QualificationOutcome = answers.lead_gen_only && outcome !== "draft" ? "not_qualified" : outcome;

  const category = classifyFromAnswers(answers, settings.approved_services);
  // The Google step's columns belong to the Hidebrandt/Teknokraft guides. Leave
  // them out of the write when unused so every other client saves exactly as before.
  const answerColumns: Record<string, unknown> = { ...answers };
  for (const f of GOOGLE_MARKETING_FIELDS) if (answers[f] === null) delete answerColumns[f];
  const row = {
    lead_id: lead.id as string,
    client_id: lead.client_id as string,
    campaign_id: (lead.campaign_id as string | null) ?? null,
    agent_id: user.id,
    ...answerColumns,
    category,
    // Submitting (anything other than a draft) is the agent's verification.
    category_source: finalOutcome === "draft" ? "auto_preliminary" : "agent_verified",
    outcome: finalOutcome,
  };

  const existing = await fetchQualificationForLead(supabase, lead.id as string);
  const { agent_id: _agentId, lead_id: _leadId, client_id: _clientId, ...updatable } = row;
  void _agentId; void _leadId; void _clientId;
  const { error } = existing
    ? await supabase.from("leadgen_lead_qualifications").update({ ...updatable, ...(user.role === "agent" ? { agent_id: user.id } : {}) }).eq("id", existing.id)
    : await supabase.from("leadgen_lead_qualifications").insert(row);
  if (error) return { error: friendlyDbError(error.message, "Failed to save the qualification.") };

  if (finalOutcome !== "draft" && !input.quiet) {
    await supabase.from("leadgen_lead_activities").insert({
      lead_id: lead.id,
      agent_id: user.id,
      activity_type: "note",
      notes: `Qualification recorded by ${user.full_name || user.email}: ${finalOutcome === "qualified" ? "Qualified" : finalOutcome === "not_qualified" ? "Not qualified" : "Needs further qualification"} - ${QUALIFICATION_CATEGORY_LABELS[category]}.`,
    });
  }

  revalidatePath(`/leadgen/agent/leads/${lead.id}`);
  revalidatePath(`/leadgen/admin/leads/${lead.id}`);
  revalidatePath("/leadgen/admin/appointment-quality");
  return { message: finalOutcome === "draft" ? "Draft saved." : "Qualification saved.", outcome: finalOutcome, categoryLabel: QUALIFICATION_CATEGORY_LABELS[category] };
}

async function notifyUser(userId: string | null | undefined, title: string, body: string | null, linkPath: string) {
  if (!userId) return;
  const { error } = await getSupabaseAdmin().from("leadgen_notifications").insert({ user_id: userId, title, body, link_path: linkPath });
  if (error) console.error("[leadgen] Failed to create qualification notification:", error);
}

async function loadAppointmentRow(id: string) {
  const { data } = await getSupabaseAdmin().from("leadgen_appointments").select("*").eq("id", id).maybeSingle();
  return (data as (LeadgenAppointmentRow & { qc_status?: string; qualification_id?: string | null }) | null) ?? null;
}

// Agent sends an appointment back to Admin after Admin asked for more
// qualification. Re-checks the lead's qualification against the client's
// current rules, links it, and returns the appointment to the approval queue.
export async function resubmitAppointmentForApprovalAction(appointmentId: string): Promise<ActionResult> {
  const user = await requireLeadgenUser();
  if (user.role !== "agent" && user.role !== "admin") return { error: "Not allowed." };
  const admin = getSupabaseAdmin();
  const appt = await loadAppointmentRow(appointmentId);
  if (!appt) return { error: "Appointment not found." };
  if (user.role === "agent" && appt.assigned_specialist_id !== user.id && appt.booking_agent_id !== user.id) return { error: "This appointment is not yours." };
  if (appt.qc_status !== "needs_info") return { error: "Only an appointment Admin sent back for more qualification can be resubmitted." };
  if (!appt.lead_id) return { error: "This appointment is not linked to a lead, so it cannot be qualified." };

  const settings = await fetchQualificationSettings(admin, appt.client_id);
  const qualification = await fetchQualificationForLead(admin, appt.lead_id);
  if (!settings || !qualification || qualification.outcome !== "qualified") return { error: "Update the lead's qualification and mark it Qualified before resubmitting." };
  const check = evaluateQualifiable(qualification, settings.approved_services, { legacy: isLegacyQualification(qualification.created_at) });
  if (!check.ok) return { error: check.reasons.join(" ") };

  const { error } = await admin.from("leadgen_appointments").update({ qc_status: "pending_review", qualification_id: qualification.id }).eq("id", appointmentId).eq("qc_status", "needs_info");
  if (error) return { error: friendlyDbError(error.message, "Failed to resubmit the appointment.") };

  const [{ data: client }, { data: adminUsers }] = await Promise.all([
    admin.from("leadgen_clients").select("id, name, contact_name, contact_email, appointment_notification_emails, sms_notification_number").eq("id", appt.client_id).maybeSingle(),
    admin.from("leadgen_users").select("id").eq("role", "admin").eq("active", true),
  ]);
  const agentName = user.full_name || user.email;
  if (client) await notifyOfNewLeadgenAppointment(appt, client as Pick<LeadgenClientRow, "id" | "name" | "contact_name" | "contact_email" | "appointment_notification_emails" | "sms_notification_number">, agentName);
  for (const a of adminUsers ?? []) await notifyUser(a.id as string, `${agentName} resubmitted an appointment for approval: ${appt.business_name}`, null, `/leadgen/admin/appointment-quality?highlight=${appointmentId}`);

  revalidatePath("/leadgen/agent/appointment-approvals");
  revalidatePath("/leadgen/admin/appointment-quality");
  return { message: "Resubmitted for Admin approval." };
}

export type ReviewDecision = "approve" | "reject" | "request_info";

// Admin decision on a proposed appointment. The database trigger is the real
// gate (complete qualification, Admin reviewer, reason/feedback required).
// Approval releases the held client/prospect notifications; nothing else ever does.
export async function reviewAppointmentQualityAction(input: {
  appointmentId: string;
  decision: ReviewDecision;
  reasonOption?: string;
  detail?: string;
  feedback?: string;
}): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const appt = await loadAppointmentRow(input.appointmentId);
  if (!appt) return { error: "Appointment not found." };
  if (appt.qc_status === "not_required") return { error: "This appointment is not part of the approval process." };

  const now = new Date().toISOString();
  const common = { qc_reviewed_by: adminUser.id, qc_reviewed_at: now };
  let patch: Record<string, unknown>;
  let from: string[];

  if (input.decision === "approve") {
    // Attach the lead's qualification when the appointment came in without one.
    let qualificationId = appt.qualification_id ?? null;
    if (!qualificationId && appt.lead_id) qualificationId = (await fetchQualificationForLead(admin, appt.lead_id))?.id ?? null;
    if (!qualificationId) return { error: "There is no qualification on file for this appointment. Request more qualification from the agent first." };
    patch = { qc_status: "approved", qualification_id: qualificationId, qc_rejection_reason: null, ...common };
    from = ["pending_review"];
  } else if (input.decision === "reject") {
    const reason = composeRejectionReason(String(input.reasonOption ?? ""), String(input.detail ?? ""));
    if (!input.reasonOption) return { error: "Choose a rejection reason." };
    patch = { qc_status: "rejected", qc_rejection_reason: reason, qc_admin_feedback: String(input.feedback ?? "").trim().slice(0, 1000) || null, ...common };
    from = ["pending_review", "needs_info"];
  } else {
    const feedback = String(input.feedback ?? "").trim().slice(0, 1000);
    if (!feedback) return { error: "Tell the agent what to qualify further." };
    patch = { qc_status: "needs_info", qc_admin_feedback: feedback, ...common };
    from = ["pending_review"];
  }
  if (!from.includes(appt.qc_status ?? "")) return { error: "This appointment has already been decided or is not awaiting review. Refresh the page." };

  const { data: updated, error } = await admin.from("leadgen_appointments").update(patch).eq("id", input.appointmentId).eq("qc_status", appt.qc_status as string).select("id");
  if (error) return { error: friendlyDbError(error.message, "Failed to save the decision.") };
  if (!updated || updated.length === 0) return { error: "Someone else already reviewed this appointment. Refresh the page." };

  const agentId = appt.assigned_specialist_id ?? appt.booking_agent_id ?? null;
  const linkPath = "/leadgen/agent/appointment-approvals";
  if (input.decision === "approve") {
    await releaseHeldAppointmentNotifications(input.appointmentId);
    await notifyUser(agentId, `Appointment approved: ${appt.business_name}`, null, linkPath);
  } else if (input.decision === "reject") {
    await notifyUser(agentId, `Appointment rejected: ${appt.business_name}`, String(patch.qc_rejection_reason), linkPath);
  } else {
    await notifyUser(agentId, `More qualification requested: ${appt.business_name}`, String(patch.qc_admin_feedback), linkPath);
  }
  if (appt.lead_id) {
    await admin.from("leadgen_lead_activities").insert({
      lead_id: appt.lead_id,
      agent_id: adminUser.id,
      activity_type: "note",
      notes: `Appointment quality review by ${adminUser.full_name || adminUser.email}: ${input.decision === "approve" ? "approved" : input.decision === "reject" ? `rejected (${patch.qc_rejection_reason})` : `more qualification requested (${patch.qc_admin_feedback})`}.`,
    });
  }

  revalidatePath("/leadgen/admin/appointment-quality");
  revalidatePath("/leadgen/admin/appointments");
  revalidatePath("/leadgen/agent/appointment-approvals");
  if (appt.lead_id) revalidatePath(`/leadgen/agent/leads/${appt.lead_id}`);
  return { message: input.decision === "approve" ? "Approved. Client and prospect notifications have been released." : input.decision === "reject" ? "Rejected." : "Sent back to the agent for more qualification." };
}

// Per-client approved services + whether the approval gate is on. Standard
// keys plus Admin-confirmed custom services.
export async function saveQualificationSettingsAction(input: { clientId: string; enabled: boolean; services: string[]; customServices: string[]; notes: string }): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("leadgen_clients").select("id, name").eq("id", input.clientId).maybeSingle();
  if (!client) return { error: "Client not found." };

  const custom = input.customServices.map((label) => customServiceKey(label)).filter((k): k is string => Boolean(k));
  const services = Array.from(new Set([...input.services.filter(isValidServiceKey), ...custom]));
  if (input.enabled && services.length === 0) return { error: "Select at least one service this client offers before turning qualification on." };

  const { error } = await admin.from("leadgen_client_qualification_settings").upsert(
    { client_id: input.clientId, enabled: Boolean(input.enabled), approved_services: services, notes: String(input.notes ?? "").trim().slice(0, 1000) || null, updated_by: adminUser.id, updated_at: new Date().toISOString() },
    { onConflict: "client_id" }
  );
  if (error) return { error: "Failed to save the settings." };
  revalidatePath("/leadgen/admin/appointment-quality");
  return { message: `Saved qualification settings for ${client.name as string}.` };
}

// Admin working through the flagged legacy appointments. Only the flag's own
// review state changes - never the appointment.
export async function reviewLegacyFlagAction(input: { appointmentId: string; status: "reviewed_ok" | "reviewed_issue" | "open"; note: string }): Promise<ActionResult> {
  const adminUser = await requireLeadgenAdmin();
  if (!["reviewed_ok", "reviewed_issue", "open"].includes(input.status)) return { error: "Invalid status." };
  const { error } = await getSupabaseAdmin()
    .from("leadgen_appointment_legacy_flags")
    .update({ review_status: input.status, admin_note: String(input.note ?? "").trim().slice(0, 1000) || null, reviewed_by: input.status === "open" ? null : adminUser.id, reviewed_at: input.status === "open" ? null : new Date().toISOString() })
    .eq("appointment_id", input.appointmentId);
  if (error) return { error: "Failed to update the flag." };
  revalidatePath("/leadgen/admin/appointment-quality");
  return { message: "Saved." };
}
