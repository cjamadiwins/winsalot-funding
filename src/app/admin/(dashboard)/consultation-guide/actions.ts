"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendConsultationGuideFollowUpEmail, resendConsultationGuideFollowUpEmail, buildFollowUpEmailDraft } from "@/lib/consultation-guide-email";
import {
  CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS,
  CONSULTATION_GUIDE_CHECKLIST_ITEMS,
  CONSULTATION_GUIDE_DISCOVERY_QUESTIONS,
  CONSULTATION_GUIDE_FOLLOW_UP_EMAIL_TEMPLATES,
  CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS,
  CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS,
  CONSULTATION_GUIDE_SERVICES,
  CONSULTATION_GUIDE_SERVICE_LABELS,
  CONSULTATION_GUIDE_SUMMARY_FIELDS,
  LEADGEN_FIT_STATUSES,
  LENDING_FIT_STATUSES,
  type ConsultationGuideAnswers,
  type ConsultationGuideChecklist,
  type ConsultationGuideFollowUpEmailTemplate,
  type ConsultationGuideService,
  type CrmConsultationGuideRow,
  type LeadgenFitStatus,
  type LendingFitStatus,
} from "@/lib/consultation-guide";
import {
  ARRANGEMENT_CAMPAIGN_STATUSES,
  ARRANGEMENT_CONVERSION_STATUSES,
  ARRANGEMENT_FEE_STATUSES,
  ARRANGEMENT_TYPES,
  type ArrangementCampaignStatus,
  type ArrangementConversionStatus,
  type ArrangementFeeStatus,
  type ArrangementType,
  type CommercialArrangementFields,
} from "@/lib/commercial-arrangement";

type ActionResult = {
  id?: string;
  error?: string;
  // Only ever set by completeConsultationGuideAction - see there.
  outcome?: "completed" | "already_completed";
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

function arrangementTypeOrDefault(formData: FormData): ArrangementType {
  const value = String(formData.get("arrangement_type") ?? "");
  return (ARRANGEMENT_TYPES as readonly string[]).includes(value) ? (value as ArrangementType) : "standard_monthly";
}

function numberOrDefault(formData: FormData, key: string, fallback: number): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrNull(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Section 9: Commercial Arrangement / Special Terms. Only the fields
// relevant when arrangement_type isn't the plain Standard Monthly default
// are ever populated from the submitted form - a Standard Monthly
// consultation's campaign/conversion/fee status and special terms stay
// null, matching "for normal consultations, keep the page clean" (no
// section-9 inputs are even rendered for that arrangement type, so there
// is nothing in the form to read for them anyway).
function arrangementFieldsFromForm(formData: FormData): CommercialArrangementFields {
  const arrangement_type = arrangementTypeOrDefault(formData);
  const campaignStatusRaw = String(formData.get("arrangement_campaign_status") ?? "");
  const conversionStatusRaw = String(formData.get("arrangement_conversion_status") ?? "");
  const feeStatusRaw = String(formData.get("arrangement_fee_status") ?? "");

  return {
    arrangement_type,
    arrangement_standard_fee: numberOrDefault(formData, "arrangement_standard_fee", 750),
    arrangement_upfront_payment: numberOrDefault(formData, "arrangement_upfront_payment", 0),
    arrangement_payment_trigger: textOrNull(formData, "arrangement_payment_trigger"),
    arrangement_attribution_period: textOrNull(formData, "arrangement_attribution_period"),
    arrangement_service: textOrNull(formData, "arrangement_service"),
    arrangement_client_services: textOrNull(formData, "arrangement_client_services"),
    arrangement_campaign_status: (ARRANGEMENT_CAMPAIGN_STATUSES as readonly string[]).includes(campaignStatusRaw)
      ? (campaignStatusRaw as ArrangementCampaignStatus)
      : null,
    arrangement_conversion_status: (ARRANGEMENT_CONVERSION_STATUSES as readonly string[]).includes(conversionStatusRaw)
      ? (conversionStatusRaw as ArrangementConversionStatus)
      : null,
    arrangement_fee_status: (ARRANGEMENT_FEE_STATUSES as readonly string[]).includes(feeStatusRaw) ? (feeStatusRaw as ArrangementFeeStatus) : null,
    arrangement_special_terms: textOrNull(formData, "arrangement_special_terms"),
    // Custom – Split Payment / Performance Milestones only - null for
    // every other arrangement_type, same as the section-9 inputs above
    // that are only ever rendered for a non-Standard-Monthly type.
    arrangement_total_value: numberOrNull(formData, "arrangement_total_value"),
    arrangement_milestone_1_amount: numberOrNull(formData, "arrangement_milestone_1_amount"),
    arrangement_milestone_1_condition: textOrNull(formData, "arrangement_milestone_1_condition"),
    arrangement_milestone_2_amount: numberOrNull(formData, "arrangement_milestone_2_amount"),
    arrangement_milestone_2_condition: textOrNull(formData, "arrangement_milestone_2_condition"),
    arrangement_campaign_start_date: dateOrNull(formData, "arrangement_campaign_start_date"),
  };
}

// Which follow-up email template this guide's draft is generated from -
// "standard" (the default, unchecked) for every consultation unless
// Admin explicitly picks a scoped, prospect-specific template like
// "Pricing & Next Steps" (for now, Unique Web World Digital Marketing).
function followUpEmailTemplateFromForm(formData: FormData): ConsultationGuideFollowUpEmailTemplate {
  const raw = String(formData.get("follow_up_email_template") ?? "");
  return (CONSULTATION_GUIDE_FOLLOW_UP_EMAIL_TEMPLATES as readonly string[]).includes(raw) ? (raw as ConsultationGuideFollowUpEmailTemplate) : "standard";
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
    ...arrangementFieldsFromForm(formData),
    checklist: checklistFromForm(formData),
    notes: textOrNull(formData, "notes"),
    follow_up_email_template: followUpEmailTemplateFromForm(formData),
  };
}

// Mirrors performWinsalotCompletion's guarded status transition
// (winsalot-consultation-completion.ts) for the appointment this guide was
// opened from - "Only Complete Consultation inside the guide may complete
// the appointment." Never calls sendWinsalotFollowUpEmail: the guide's own
// service-specific email above is the only email a guide completion ever
// sends, so the appointment's old Lead-Gen-only follow-up must never also
// fire here. Best-effort and silent when it doesn't apply - an appointment
// that isn't currently "booked" (already completed via the old flow,
// cancelled, or no-show) is left untouched rather than erroring, since the
// guide's own completion above is what actually matters to the caller.
async function completeLinkedAppointment(appointmentId: string, actor: { userId: string; name: string }): Promise<void> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  await admin
    .from("winsalot_appointments")
    .update({
      status: "completed",
      completed_at: nowIso,
      completed_by_user_id: actor.userId,
      completed_by_name: actor.name,
      updated_at: nowIso,
    })
    .eq("id", appointmentId)
    .eq("status", "booked");
}

// "When the consultation is saved or completed, automatically save the
// commercial arrangement information to the linked Growth CRM business/
// prospect record. Do not make the user manually re-enter the same
// information." - copies exactly the Section 9 fields (never
// conversion_date/converted_business/etc., which only "Mark as Converted"
// on the business record itself ever sets) onto the linked opportunity.
// Runs on every completion that has a linked opportunity, not only a
// Performance-Based Trial - a Standard Monthly consultation's default
// values are already what a plain opportunity should show, so this never
// needs a special case for "don't touch it when it's just Standard."
async function copyArrangementToOpportunity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  opportunityId: string,
  arrangement: CommercialArrangementFields
): Promise<void> {
  await supabase.from("crm_opportunities").update(arrangement).eq("id", opportunityId);
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
  const { error } = await supabase.from("crm_consultation_guides").update({ ...fields, updated_by: admin.id }).eq("id", id);
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

  const completion = { status: "completed" as const, completed_at: new Date().toISOString(), completed_by: admin.id, updated_by: admin.id };

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
      const { error: fieldsError } = await supabase.from("crm_consultation_guides").update({ ...fields, updated_by: admin.id }).eq("id", guideId);
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

  if (justCompleted) {
    await logConsultationActivity(supabase, fields.opportunity_id, admin.id, `Consultation completed by ${admin.full_name || admin.email}.`);

    if (fields.opportunity_id) {
      await copyArrangementToOpportunity(supabase, fields.opportunity_id, {
        arrangement_type: fields.arrangement_type,
        arrangement_standard_fee: fields.arrangement_standard_fee,
        arrangement_upfront_payment: fields.arrangement_upfront_payment,
        arrangement_payment_trigger: fields.arrangement_payment_trigger,
        arrangement_attribution_period: fields.arrangement_attribution_period,
        arrangement_service: fields.arrangement_service,
        arrangement_client_services: fields.arrangement_client_services,
        arrangement_campaign_status: fields.arrangement_campaign_status,
        arrangement_conversion_status: fields.arrangement_conversion_status,
        arrangement_fee_status: fields.arrangement_fee_status,
        arrangement_special_terms: fields.arrangement_special_terms,
        arrangement_total_value: fields.arrangement_total_value,
        arrangement_milestone_1_amount: fields.arrangement_milestone_1_amount,
        arrangement_milestone_1_condition: fields.arrangement_milestone_1_condition,
        arrangement_milestone_2_amount: fields.arrangement_milestone_2_amount,
        arrangement_milestone_2_condition: fields.arrangement_milestone_2_condition,
        arrangement_campaign_start_date: fields.arrangement_campaign_start_date,
      });
    }

    if (fields.appointment_id) {
      await completeLinkedAppointment(fields.appointment_id, { userId: admin.id, name: admin.full_name || admin.email });
      revalidatePath("/admin/crm/appointments");
      revalidatePath("/agent/appointments");
    }

    // Generate (never send) the follow-up email draft from what was just
    // saved - "I want the CRM to generate and save the follow-up email
    // content...so I can review it and manually send...when I am ready."
    // Nothing is emailed here; Admin's own, later, explicit "Send Email"
    // click on the guide's Follow-Up Email section is the only thing that
    // ever calls Resend (see sendConsultationGuideFollowUpEmail).
    const draft = buildFollowUpEmailDraft(fields, admin.full_name || admin.email);
    if (draft) {
      await supabase
        .from("crm_consultation_guides")
        .update({ follow_up_email_subject: draft.subject, follow_up_email_body: draft.body })
        .eq("id", guideId);
    }
  }

  revalidatePath("/admin/consultation-guide");
  revalidatePath(`/admin/consultation-guide/${guideId}`);
  if (fields.opportunity_id) revalidatePath(`/admin/crm/opportunities/${fields.opportunity_id}`);

  return {
    id: guideId,
    outcome: justCompleted ? "completed" : "already_completed",
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

// Renders exactly what "Mark Consultation Complete" would GENERATE as the
// follow-up email draft, from the form's current (unsaved) values, without
// persisting or sending anything - powers the confirmation modal's preview
// so it can never diverge from what a confirmed completion actually saves.
// Also doubles as the server-side "a service must be chosen" validation the
// brief requires. Completing a consultation never sends this email itself -
// it only saves it as an editable draft for Admin to review and send later
// from the guide's own Follow-Up Email section.
export async function previewConsultationCompletionAction(formData: FormData): Promise<ConsultationCompletionPreview> {
  const admin = await requireCrmAdmin();
  const fields = fieldsFromForm(formData);
  if (!fields.service) {
    return { error: "Select a service (Lead Generation or Business Finance) before completing this consultation." };
  }

  const draft = buildFollowUpEmailDraft(fields, admin.full_name || admin.email);
  if (!draft) {
    return { error: "Select a service (Lead Generation or Business Finance) before completing this consultation." };
  }

  return {
    recipientName: fields.contact_name || "—",
    recipientEmail: fields.email,
    service: fields.service,
    serviceLabel: CONSULTATION_GUIDE_SERVICE_LABELS[fields.service],
    subject: draft.subject,
    bodyText: draft.body,
  };
}

// Admin-only "Edit Email" save for a completed guide's Follow-Up Email
// section - lets Admin correct the generated draft (subject and/or plain-
// text body) before ever sending it, and edit it again later for a resend
// ("Admin must be able to review and edit the email before sending").
// Never sends anything itself; sendConsultationFollowUpEmailAction /
// resendConsultationFollowUpEmailAction below always send exactly what was
// last saved here.
export async function updateFollowUpEmailDraftAction(id: string, subject: string, body: string): Promise<{ error?: string }> {
  await requireCrmAdmin();
  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  if (!trimmedSubject || !trimmedBody) {
    return { error: "Both the subject and body are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_consultation_guides")
    .update({ follow_up_email_subject: trimmedSubject, follow_up_email_body: trimmedBody })
    .eq("id", id);
  if (error) return { error: "Failed to save the follow-up email draft." };

  revalidatePath(`/admin/consultation-guide/${id}`);
  return {};
}

// Admin-only "Send Email" click from a completed guide's Follow-Up Email
// section - the ONLY action that ever actually sends the real email
// (covers both a first send and a retry after a previous send attempt
// failed). Never automatic on its own, whether the guide was just
// completed through the normal form or has been sitting Completed with a
// Not Sent draft for a while, e.g. one completed directly via a database
// migration before this feature existed ("do not automatically send an
// email... require a manual click for these existing records"). Always a
// deliberate, explicit admin click, same as sendManualWinsalotFollowUpEmail's
// own manual resend for appointments. Duplicate-send protection is a real
// database compare-and-swap inside sendConsultationGuideFollowUpEmail
// itself (not just this function's own status check below), so two
// near-simultaneous clicks - or an accidental double-click - can never
// both send.
export async function sendConsultationFollowUpEmailAction(id: string): Promise<{ error?: string; message?: string }> {
  const admin = await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const { data: guideRow } = await supabaseAdmin.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (!guideRow) return { error: "Consultation guide not found." };
  const guide = guideRow as CrmConsultationGuideRow;

  if (guide.status !== "completed") return { error: "Only a completed consultation can send its follow-up email." };
  if (guide.follow_up_email_status === "sent") return { error: "The follow-up email has already been sent." };
  if (!guide.service) return { error: "Select a service and save before sending the follow-up email." };
  if (!guide.email) return { error: "This consultation has no recipient email address on file." };
  if (!guide.follow_up_email_subject || !guide.follow_up_email_body) {
    return { error: "No email draft has been generated for this consultation yet." };
  }

  const result = await sendConsultationGuideFollowUpEmail(supabaseAdmin, guide, { name: admin.full_name || admin.email, email: admin.email });

  revalidatePath("/admin/consultation-guide");
  revalidatePath(`/admin/consultation-guide/${id}`);
  if (guide.opportunity_id) revalidatePath(`/admin/crm/opportunities/${guide.opportunity_id}`);

  if (result.status === "failed") return { error: result.error };
  return { message: "Follow-up email sent." };
}

// Admin-only, explicitly confirmed "Resend Email" for a completed guide
// whose original send already succeeded - the client-side confirm dialog
// is what makes this deliberate (see resendConsultationGuideFollowUpEmail
// in consultation-guide-email.ts for why the original send's own record is
// never touched). For a guide whose original send hasn't succeeded yet
// (not_sent/failed), use sendConsultationFollowUpEmailAction above instead
// - that's still the first successful send, not a resend.
export async function resendConsultationFollowUpEmailAction(id: string): Promise<{ error?: string; message?: string }> {
  const admin = await requireCrmAdmin();
  const supabaseAdmin = getSupabaseAdmin();

  const { data: guideRow } = await supabaseAdmin.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (!guideRow) return { error: "Consultation guide not found." };
  const guide = guideRow as CrmConsultationGuideRow;

  if (guide.status !== "completed") return { error: "Only a completed consultation can resend its follow-up email." };
  if (guide.follow_up_email_status !== "sent") return { error: "This consultation's follow-up email hasn't sent successfully yet - use Send Email instead." };
  if (!guide.service) return { error: "Select a service and save before resending the follow-up email." };
  if (!guide.email) return { error: "This consultation has no recipient email address on file." };

  const result = await resendConsultationGuideFollowUpEmail(supabaseAdmin, guide, {
    name: admin.full_name || admin.email,
    email: admin.email,
    userId: admin.id,
  });

  revalidatePath("/admin/consultation-guide");
  revalidatePath(`/admin/consultation-guide/${id}`);
  if (guide.opportunity_id) revalidatePath(`/admin/crm/opportunities/${guide.opportunity_id}`);

  if (result.status === "failed") return { error: result.error };
  return { message: "Follow-up email resent." };
}

// Admin-only, explicitly confirmed "Delete consultation" from the bottom
// of the Edit Consultation page - only the guide row itself is removed. crm_consultation_guides
// has no child rows referencing it (the linked appointment and
// opportunity are what it points *to*, not the other way around, and the
// sent follow-up email lives in crm_lead_emails, keyed off the
// opportunity rather than the guide), so a plain delete here can never
// take the linked appointment, prospect, or email/audit history with it.
export async function deleteConsultationGuideAction(id: string): Promise<{ error?: string }> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("crm_consultation_guides").delete().eq("id", id);
  if (error) return { error: "Failed to delete the consultation record." };

  revalidatePath("/admin/consultation-guide");
  return {};
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
