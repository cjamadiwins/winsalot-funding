import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentBriefRow } from "./leadgen-appointment-prep";
import type { LeadgenAppointmentRow } from "./leadgen-types";
import { renderAppointmentBriefPdf, type BriefPdfInput } from "./leadgen-appointment-brief-pdf";
import { loadQualificationBriefLines } from "./leadgen-appointment-qc";

// Shared by the PDF preview/download route and the Send Appointment Brief
// action, so the PDF Admin previews is exactly the PDF that is attached.
// Reads only (lead website/industry, assigned specialist's name).
export async function buildBriefPdfInput(
  admin: SupabaseClient,
  appointment: LeadgenAppointmentRow,
  brief: AppointmentBriefRow,
  clientName: string
): Promise<BriefPdfInput> {
  const qualificationLines = await loadQualificationBriefLines(admin, appointment);
  const [{ data: lead }, { data: agent }] = await Promise.all([
    appointment.lead_id ? admin.from("leadgen_leads").select("website, industry").eq("id", appointment.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    appointment.assigned_specialist_id ? admin.from("leadgen_users").select("full_name").eq("id", appointment.assigned_specialist_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    clientName,
    businessName: appointment.business_name,
    contactName: appointment.contact_name,
    phone: appointment.phone,
    email: appointment.email,
    website: (lead as { website: string | null } | null)?.website ?? null,
    industry: (lead as { industry: string | null } | null)?.industry ?? null,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time,
    timezone: appointment.timezone,
    meetingType: appointment.meeting_type,
    agentName: (agent as { full_name: string } | null)?.full_name ?? null,
    brief,
    qualificationLines,
  };
}

export function briefPdfFilename(businessName: string): string {
  const safe = businessName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "appointment";
  return `appointment-brief-${safe}.pdf`;
}

// Renders the PDF for an email attachment. Throws if rendering fails or the
// output is not a PDF, so the caller can stop before anything is sent.
export async function renderBriefPdfAttachment(
  admin: SupabaseClient,
  appointment: LeadgenAppointmentRow,
  brief: AppointmentBriefRow,
  clientName: string
): Promise<{ filename: string; content: Buffer }> {
  const pdf = await renderAppointmentBriefPdf(await buildBriefPdfInput(admin, appointment, brief, clientName));
  if (pdf.length < 1000 || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Generated PDF is not valid.");
  return { filename: briefPdfFilename(appointment.business_name), content: pdf };
}
