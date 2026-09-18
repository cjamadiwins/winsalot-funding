"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendConsultationGuideFollowUpEmail, buildConsultationGuideFollowUpEmail } from "@/lib/consultation-guide-email";
import {
  CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS,
  CONSULTATION_GUIDE_CHECKLIST_ITEMS,
  CONSULTATION_GUIDE_DISCOVERY_QUESTIONS,
  CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS,
  CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS,
  CONSULTATION_GUIDE_SERVICES,
  CONSULTATION_GUIDE_SERVICE_LABELS,
  CONSULTATION_GUIDE_SUMMARY_FIELDS,
  LEADGEN_FIT_STATUSES,
  LENDING_FIT_STATUSES,
  type ConsultationGuideAnswers,
  type ConsultationGuideChecklist,
  type ConsultationGuideFollowUpStatus,
  type ConsultationGuideService,
  type CrmConsultationGuideRow,
  type LeadgenFitStatus,
  type LendingFitStatus,
} from "@/lib/consultation-guide";

type ActionResult = {
  id?: string;
  error?: string;
  // Only ever set by completeConsultationGuideAction - see there.
  outcome?: "completed" | "already_completed";
  followUpEmailStatus?: ConsultationGuideFollowUpStatus;
  noFollowUpEmailReason?: string | null;
};

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function dateOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function serviceOrNull(formData: FormData): ConsultationGuideService | null {
  const value = String(formData.get("service") ?? "");
  return (CONSULTATION_GUIDE_SERVICES as readonly string[]).includes(value) ? (value as ConsultationGuideService) : null;
}

function answersFromForm(formData: FormData, fields: readonly { key: string }[]): ConsultationGuideAnswers {
  const answers: ConsultationGuideAnswers = {};
  for (const field of fields) {
    const value = String(formData.get(field.key) ?? "").trim();
    if (value) answers[field.key] = value;
  }
  return answers;
}

function checklistFromForm(formData: FormData): ConsultationGuideChecklist {
  const checklist: ConsultationGuideChecklist = {};
  for (const item of CONSULTATION_GUIDE_CHECKLIST_ITEMS) {
    checklist[item.key] = formData.get(item.key) === "on";
  }
  return checklist;
}

// Shared by both the create and update paths below - every column this
// guide's form can submit except status/completion, which each caller
// sets explicitly (a plain Save must never flip status back to draft, and
// draft vs. complete are the only two ways status changes).
function fieldsFromForm(formData: FormData) {
  const leadgenStatusRaw = String(formData.get("leadgen_fit_status") ?? "");
  const lendingStatusRaw = String(formData.get("lending_fit_status") ?? "");

  return {
    opportunity_id: textOrNull(formData, "opportunity_id"),
    appointment_id: textOrNull(formData, "appointment_id"),
    service: serviceOrNull(formData),
    business_name: textOrNull(formData, "business_name"),
    contact_name: textOrNull(formData, "contact_name"),
    phone: textOrNull(formData, "phone"),
    email: textOrNull(formData, "email"),
    industry: textOrNull(formData, "industry"),
    location: textOrNull(formData, "location"),
    consultation_date: dateOrNull(formData, "consultation_date"),
    consultant_name: textOrNull(formData, "consultant_name"),
    discovery: answersFromForm(formData, CONSULTATION_GUIDE_DISCOVERY_QUESTIONS),
    leadgen_fit_status: LEADGEN_FIT_STATUSES.includes(leadgenStatusRaw as LeadgenFitStatus) ? (leadgenStatusRaw as LeadgenFitStatus) : null,
    leadgen_fit: answersFromForm(formData, CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS),
    campaign_expectations: answersFromForm(formData, CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS),
    lending_fit_status: LENDING_FIT_STATUSES.includes(lendingStatusRaw as LendingFitStatus) ? (lendingStatusRaw as LendingFitStatus) : null,
    lending_fit: answersFromForm(formData, CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS),
    summary: answersFromForm(formData, CONSULTATION_GUIDE_SUMMARY_FIELDS),
    checklist: checklistFromForm(formData),
    notes: textOrNull(formData, "notes"),
  };
}

async function logConsultationActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  opportunityId: string | null,
  agentId: string,
  note: string
) {
  // Only opportunities have a crm_activities target column today - a
  // consultation logged for someone not yet in the CRM has no record to
  // attach the activity to, so it's simply skipped (the guide itself is
  // still saved either way).
  if (!opportunityId) return;
  await supabase.from("crm_activities").insert({
    opportunity_id: opportunityId,
    agent_id: agentId,
    activity_type: "note",
    notes: note,
  });
}

// Creates a new consultation guide (status always starts as 'draft',
// regardless of which button was pressed - "Mark Consultation Complete"
// on a brand-new guide completes it via a second call to
// completeConsultationGuideAction right after, same as an existing draft
// would).
export async function createConsultationGuideAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const fields = fieldsFromForm(formData);
  const { data, error } = await supabase
    .from("crm_consultation_guides")
    .insert({ ...fields, created_by: admin.id, status: "draft" })
    .select("id")
    .single();

  if (error || !data) return { error: "Failed to save the consultation guide." };

  await logConsultationActivity(
    supabase,
    fields.opportunity_id,
    admin.id,
    `Consultation guide started by ${admin.full_name || admin.email}.`
  );

  revalidatePath("/admin/consultation-guide");
  if (fields.opportunity_id) revalidatePath(`/admin/crm/opportunities/${fields.opportunity_id}`);
  return { id: data.id as string };
}

// Saves an existing guide's fields without changing its status - used by
// both "Save Consultation" and "Save as Draft" once a guide already has an
// id (a completed guide's fields can still be corrected, but this never
// re-opens it back to draft; see completeConsultationGuideAction for the
// only path that changes status).
export async function updateConsultationGuideAction(id: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const fields = fieldsFromForm(formData);
  const { error } = await supabase.from("crm_consultation_guides").update(fields).eq("id", id);
  if (error) return { error: "Failed to save the consultation guide." };

  await logConsultationActivity(
    supabase,
    fields.opportunity_id,
    admin.id,
    `Consultation guide updated by ${admin.full_name || admin.email}.`
  );

  revalidatePath("/admin/consultation-guide");
  revalidatePath(`/admin/consultation-guide/${id}`);
  if (fields.opportunity_id) revalidatePath(`/admin/crm/opportunities/${fields.opportunity_id}`);
  return { id };
}

// Saves the guide's current fields and marks it completed - the one path
// that ever sets status='completed', and the one path that ever triggers
// the one-time service-specific follow-up email. Creates the row first if
// it doesn't exist yet (completing a brand-new, never-saved guide in one
// step).
//
// Duplicate-send protection: the status transition itself is a guarded
// compare-and-swap (`.eq("status", "draft")`), the same pattern
// performWinsalotCompletion uses for appointments - the *database*, not
// just a disabled button, is what guarantees "one time only." If this
// fires twice (double-click, a refresh resubmitting the form, two tabs),
// only the request that actually flips 'draft' -> 'completed' sees a row
// back and goes on to send the email; every other request sees zero rows
// affected, still saves the caller's latest field edits, and returns
// "already_completed" without sending anything.
export async function completeConsultationGuideAction(id: string | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const fields = fieldsFromForm(formData);
  if (!fields.service) {
    return { error: "Select a service (Lead Generation or Business Finance) before completing this consultation." };
  }

  const completion = { status: "completed" as const, completed_at: new Date().toISOString(), completed_by: admin.id };

  let guideId = id;
  let justCompleted = false;

  if (guideId) {
    const { data: updated, error } = await supabase
      .from("crm_consultation_guides")
      .update({ ...fields, ...completion })
      .eq("id", guideId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error) return { error: "Failed to complete the consultation guide." };

    if (updated) {
      justCompleted = true;
    } else {
      // Already completed (duplicate click, a resubmitted form after a
      // refresh, or a second tab) - still save the latest field edits, but
      // never re-run the transition or send a second email.
      const { error: fieldsError } = await supabase.from("crm_consultation_guides").update(fields).eq("id", guideId);
      if (fieldsError) return { error: "Failed to save the consultation guide." };
    }
  } else {
    const { data, error } = await supabase
      .from("crm_consultation_guides")
      .insert({ ...fields, created_by: admin.id, ...completion })
      .select("id")
      .single();
    if (error || !data) return { error: "Failed to complete the consultation guide." };
    guideId = data.id as string;
    justCompleted = true;
  }

  let followUpEmailStatus: ConsultationGuideFollowUpStatus = "not_sent";
  let noFollowUpEmailReason: string | null = null;
  let sendErrorMessage: string | undefined;

  if (justCompleted) {
    await logConsultationActivity(supabase, fields.opportunity_id, admin.id, `Consultation completed by ${admin.full_name || admin.email}.`);

    if (!fields.email) {
      noFollowUpEmailReason = "No recipient email";
      await supabase.from("crm_consultation_guides").update({ no_follow_up_email_reason: noFollowUpEmailReason }).eq("id", guideId);
    } else {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: guideRow } = await supabaseAdmin.from("crm_consultation_guides").select("*").eq("id", guideId).maybeSingle();
      if (guideRow) {
        const result = await sendConsultationGuideFollowUpEmail(supabaseAdmin, guideRow as CrmConsultationGuideRow, {
          name: admin.full_name || admin.email,
          email: admin.email,
        });
        if (result.status === "sent") {
          followUpEmailStatus = "sent";
        } else {
          followUpEmailStatus = "failed";
          sendErrorMessage = result.error;
        }
      }
    }
  } else {
    const { data: existing } = await supabase
      .from("crm_consultation_guides")
      .select("follow_up_email_status, no_follow_up_email_reason")
      .eq("id", guideId)
      .maybeSingle();
    followUpEmailStatus = (existing?.follow_up_email_status as ConsultationGuideFollowUpStatus) ?? "not_sent";
    noFollowUpEmailReason = existing?.no_follow_up_email_reason ?? null;
  }

  revalidatePath("/admin/consultation-guide");
  revalidatePath(`/admin/consultation-guide/${guideId}`);
  if (fields.opportunity_id) revalidatePath(`/admin/crm/opportunities/${fields.opportunity_id}`);

  return {
    id: guideId,
    outcome: justCompleted ? "completed" : "already_completed",
    followUpEmailStatus,
    noFollowUpEmailReason,
    error: sendErrorMessage ? `Consultation marked completed, but the follow-up email failed to send: ${sendErrorMessage}` : undefined,
  };
}

export async function getConsultationGuideAction(id: string): Promise<CrmConsultationGuideRow | { error: string }> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { error: "This consultation guide could not be found." };
  return data as CrmConsultationGuideRow;
}

export type ConsultationCompletionPreview =
  | { error: string }
  | {
      recipientName: string;
      recipientEmail: string | null;
      service: ConsultationGuideService;
      serviceLabel: string;
      subject: string;
      bodyText: string;
    };

// Renders exactly what "Mark Consultation Complete" would send, from the
// form's current (unsaved) values, without persisting or sending anything
// - powers the confirmation modal's preview so it can never diverge from
// what a confirmed completion actually sends. Also doubles as the
// server-side "a service must be chosen" validation the brief requires.
export async function previewConsultationCompletionAction(formData: FormData): Promise<ConsultationCompletionPreview> {
  const admin = await requireCrmAdmin();
  const fields = fieldsFromForm(formData);
  if (!fields.service) {
    return { error: "Select a service (Lead Generation or Business Finance) before completing this consultation." };
  }

  const email = buildConsultationGuideFollowUpEmail(fields.service, {
    contactName: fields.contact_name || "there",
    consultantName: fields.consultant_name || admin.full_name || admin.email,
  });

  return {
    recipientName: fields.contact_name || "—",
    recipientEmail: fields.email,
    service: fields.service,
    serviceLabel: CONSULTATION_GUIDE_SERVICE_LABELS[fields.service],
    subject: email.subject,
    bodyText: email.text,
  };
}

// Admin-only, controlled "Retry Follow-Up Email" for a completed guide
// whose automatic send failed - never automatic/repeated on its own. Only
// available once (guarded on the current follow_up_email_status, not a
// database compare-and-swap): a deliberate, explicit admin click, same as
// sendManualWinsalotFollowUpEmail's own manual resend for appointments.
export async function retryConsultationFollowUpEmailAction(id: string): Promise<{ error?: string; message?: string }> {
  const admin = await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const { data: guideRow } = await supabaseAdmin.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (!guideRow) return { error: "Consultation guide not found." };
  const guide = guideRow as CrmConsultationGuideRow;

  if (guide.status !== "completed") return { error: "Only a completed consultation can retry its follow-up email." };
  if (guide.follow_up_email_status === "sent") return { error: "The follow-up email has already been sent." };
  if (!guide.service) return { error: "Select a service and save before retrying the follow-up email." };
  if (!guide.email) return { error: "This consultation has no recipient email address on file." };

  const result = await sendConsultationGuideFollowUpEmail(supabaseAdmin, guide, { name: admin.full_name || admin.email, email: admin.email });

  revalidatePath("/admin/consultation-guide");
  revalidatePath(`/admin/consultation-guide/${id}`);
  if (guide.opportunity_id) revalidatePath(`/admin/crm/opportunities/${guide.opportunity_id}`);

  if (result.status === "failed") return { error: result.error };
  return { message: "Follow-up email sent." };
}

export type AppointmentSearchResult = {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  appointment_start_at: string;
  status: string;
};

// Manual appointment search for /admin/consultation-guide/new when it's
// opened without ?appointmentId= - "allow Admin to search for and select
// an existing appointment." Admin-only, same as every other read in this
// file; strips characters that would otherwise break the .or() filter
// syntax below rather than trying to escape them.
export async function searchAppointmentsAction(query: string): Promise<AppointmentSearchResult[]> {
  await requireCrmAdmin();
  const trimmed = query.trim().replace(/[,()]/g, "");
  if (!trimmed) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("winsalot_appointments")
    .select("id, business_name, contact_name, email, appointment_start_at, status")
    .or(`business_name.ilike.%${trimmed}%,contact_name.ilike.%${trimmed}%`)
    .order("appointment_start_at", { ascending: false })
    .limit(10);

  return (data ?? []) as AppointmentSearchResult[];
}
