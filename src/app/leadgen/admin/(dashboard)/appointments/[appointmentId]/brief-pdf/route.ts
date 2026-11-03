import { NextRequest, NextResponse } from "next/server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { renderAppointmentBriefPdf } from "@/lib/leadgen-appointment-brief-pdf";
import { briefPdfFilename, buildBriefPdfInput } from "@/lib/leadgen-appointment-brief-pdf-data";
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

  const { data: client } = await admin.from("leadgen_clients").select("name").eq("id", appointment.client_id).maybeSingle();
  const pdf = await renderAppointmentBriefPdf(await buildBriefPdfInput(admin, appointment, brief, (client as { name: string } | null)?.name ?? "Client"));

  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${briefPdfFilename(appointment.business_name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
