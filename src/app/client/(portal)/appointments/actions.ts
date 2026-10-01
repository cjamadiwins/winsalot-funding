"use server";

import { revalidatePath } from "next/cache";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  FEEDBACK_OUTCOMES,
  FIT_ISSUES,
  OPPORTUNITY_QUALITIES,
  hasAppointmentPassed,
  isPreparableAppointment,
  trimmedOrNull,
  type FeedbackOutcome,
  type OpportunityQuality,
} from "@/lib/leadgen-appointment-prep";

type ActionResult = { error?: string; message?: string };

export type FeedbackInput = {
  outcome: string;
  what_happened: string;
  opportunity_quality: string;
  fit_issues: string[];
  future_notes: string;
};

// "Update Appointment Outcome". Identity (client + user) comes only from the
// signed-in session. The appointment is read through the client's own RLS
// session scoped by BOTH the id and the session's client_id, so a tampered
// appointmentId can never attach feedback to another client's appointment;
// only after that ownership check does the write use service_role (the
// table grants clients SELECT only). Informational only - this never edits
// the appointment, campaign criteria, call lists, assignments or scripts.
export async function submitAppointmentFeedbackAction(appointmentId: string, input: FeedbackInput): Promise<ActionResult> {
  const { user, client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const { data: appointment } = await supabase
    .from("leadgen_appointments")
    .select("id, client_id, status, appointment_date, appointment_time, timezone")
    .eq("id", appointmentId)
    .eq("client_id", client.id)
    .maybeSingle();
  if (!appointment) return { error: "Appointment not found." };
  if (!isPreparableAppointment(appointment) || !hasAppointmentPassed(appointment)) {
    return { error: "Feedback opens once the appointment has taken place." };
  }

  if (!(FEEDBACK_OUTCOMES as readonly string[]).includes(input.outcome)) return { error: "Select the appointment outcome." };
  const quality = input.opportunity_quality;
  if (quality && !(OPPORTUNITY_QUALITIES as readonly string[]).includes(quality)) return { error: "Select a valid opportunity rating." };
  const fitIssues = Array.from(new Set((input.fit_issues ?? []).filter((issue) => (FIT_ISSUES as readonly string[]).includes(issue))));

  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("leadgen_appointment_feedback")
    .upsert(
      {
        appointment_id: appointment.id,
        client_id: client.id,
        outcome: input.outcome as FeedbackOutcome,
        what_happened: trimmedOrNull(input.what_happened, 600),
        opportunity_quality: (quality || null) as OpportunityQuality | null,
        fit_issues: fitIssues,
        future_notes: trimmedOrNull(input.future_notes, 600),
        submitted_by: user.id,
        updated_at: now,
      },
      { onConflict: "appointment_id" }
    );
  if (error) return { error: "Failed to save your feedback. Please try again." };

  revalidatePath("/client/appointments");
  revalidatePath(`/client/appointments/${appointment.id}`);
  revalidatePath("/leadgen/admin/appointments");
  return { message: "Thank you - your feedback was saved." };
}
