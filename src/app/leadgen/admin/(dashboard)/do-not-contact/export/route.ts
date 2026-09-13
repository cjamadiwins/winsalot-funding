import { NextResponse } from "next/server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { buildDncCsv, dncCsvExportFilename, getAllDncSuppressions } from "@/lib/dnc-suppression";

export const runtime = "nodejs";

// Item 5: "ADMIN ONLY should be able to Export the Do Not Contact list as
// CSV" - requireLeadgenAdmin() is the entire enforcement.
export async function GET() {
  await requireLeadgenAdmin();
  const rows = await getAllDncSuppressions();
  return new NextResponse(buildDncCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dncCsvExportFilename("Lead_Generation_CRM")}"`,
    },
  });
}
