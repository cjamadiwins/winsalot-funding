import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { leadgenClientReportCsv, leadgenReportFilename, resolveLeadgenReportPeriod } from "@/lib/leadgen-client-report";
import { renderLeadgenClientReportPdf } from "@/lib/leadgen-client-report-pdf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenClientRow } from "@/lib/leadgen-types";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const admin = getSupabaseAdmin();
  const { data: client } = await admin.from("leadgen_clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();

  const period = resolveLeadgenReportPeriod(request.nextUrl.searchParams.get("from"), request.nextUrl.searchParams.get("to"));
  const report = await loadLeadgenClientReport(admin, client as LeadgenClientRow, period);
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const filename = leadgenReportFilename(client.name, period, format);

  if (format === "csv") {
    return new NextResponse(leadgenClientReportCsv(report), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  }

  const pdf = await renderLeadgenClientReportPdf(report);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
