import { NextRequest, NextResponse } from "next/server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { renderAppointmentBriefPdf } from "@/lib/leadgen-appointment-brief-pdf";
import { fetchBrief } from "@/lib/leadgen-appointment-prep-data";
import { isPreparableAppointment } from "@/lib/leadgen-appointment-prep";
import type { LeadgenAppointmentRow } from "@/lib/leadgen-types";

export const runtime = "nodejs";

// Admin-only, read-only. Renders the SAVED brief as a PDF: inline for the
// preview, as an attachment with ?download=1. Nothing is written or sent.
export async function GET(request: NextRequest, { params }: { params: Promise<{ appointmentId: string }> }) {
  await requireLeadgenAdmin();
  const { appointmentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) return new NextResponse("Not found", { status: 404 });

  const admin = getSupabaseAdmin();
  const { data } = await admin.from("leadgen_appointments").select("*").eq("id", appointmentId).maybeSingle();
  const appointment = data as LeadgenAppointmentRow | null;
  if (!appointment || !isPreparableAppointment(appointment)) return new NextResponse("Not found", { status: 404 });

  const brief = await fetchBrief(admin, appointmentId);
  if (!brief) return new NextResponse("Save the brief before previewing the PDF.", { status: 404 });

  const [{ data: client }, { data: lead }, { data: agent }] = await Promise.all([
    admin.from("leadgen_clients").select("name").eq("id", appointment.client_id).maybeSingle(),
    appointment.lead_id ? admin.from("leadgen_leads").select("website, industry").eq("id", appointment.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    appointment.assigned_specialist_id ? admin.from("leadgen_users").select("full_name").eq("id", appointment.assigned_specialist_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const pdf = await renderAppointmentBriefPdf({
    clientName: (client as { name: string } | null)?.name ?? "Client",
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
  });

  const safeName = appointment.business_name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "appointment";
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="appointment-brief-${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
