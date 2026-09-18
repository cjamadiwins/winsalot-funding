"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  CONSULTATION_GUIDE_CAMPAIGN_EXPECTATION_QUESTIONS,
  CONSULTATION_GUIDE_CHECKLIST_ITEMS,
  CONSULTATION_GUIDE_DISCOVERY_QUESTIONS,
  CONSULTATION_GUIDE_LEADGEN_FIT_QUESTIONS,
  CONSULTATION_GUIDE_LENDING_FIT_QUESTIONS,
  CONSULTATION_GUIDE_SUMMARY_FIELDS,
  LEADGEN_FIT_STATUSES,
  LENDING_FIT_STATUSES,
  type ConsultationGuideAnswers,
  type ConsultationGuideChecklist,
  type CrmConsultationGuideRow,
  type LeadgenFitStatus,
  type LendingFitStatus,
} from "@/lib/consultation-guide";

type ActionResult = { id?: string; error?: string };

function textOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function dateOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
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
// that ever sets status='completed'. Creates the row first if it doesn't
// exist yet (completing a brand-new, never-saved guide in one step).
export async function completeConsultationGuideAction(id: string | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const fields = fieldsFromForm(formData);
  const completion = { status: "completed" as const, completed_at: new Date().toISOString(), completed_by: admin.id };

  let guideId = id;
  if (guideId) {
    const { error } = await supabase.from("crm_consultation_guides").update({ ...fields, ...completion }).eq("id", guideId);
    if (error) return { error: "Failed to complete the consultation guide." };
  } else {
    const { data, error } = await supabase
      .from("crm_consultation_guides")
      .insert({ ...fields, created_by: admin.id, ...completion })
      .select("id")
      .single();
    if (error || !data) return { error: "Failed to complete the consultation guide." };
    guideId = data.id as string;
  }

  await logConsultationActivity(
    supabase,
    fields.opportunity_id,
    admin.id,
    `Consultation completed by ${admin.full_name || admin.email}.`
  );

  revalidatePath("/admin/consultation-guide");
  revalidatePath(`/admin/consultation-guide/${guideId}`);
  if (fields.opportunity_id) revalidatePath(`/admin/crm/opportunities/${fields.opportunity_id}`);
  return { id: guideId };
}

export async function getConsultationGuideAction(id: string): Promise<CrmConsultationGuideRow | { error: string }> {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { error: "This consultation guide could not be found." };
  return data as CrmConsultationGuideRow;
}
