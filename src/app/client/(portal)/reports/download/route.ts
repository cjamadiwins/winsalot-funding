import { NextRequest, NextResponse } from "next/server";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { loadLeadgenClientReport } from "@/lib/leadgen-client-report-data";
import { leadgenClientReportCsv, leadgenReportFilename, resolveLeadgenReportPeriod } from "@/lib/leadgen-client-report";
import { renderLeadgenClientReportPdf } from "@/lib/leadgen-client-report-pdf";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();
  const period = resolveLeadgenReportPeriod(request.nextUrl.searchParams.get("from"), request.nextUrl.searchParams.get("to"));
  const report = await loadLeadgenClientReport(supabase, client, period);
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
