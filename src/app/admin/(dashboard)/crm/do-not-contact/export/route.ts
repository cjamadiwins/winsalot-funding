import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { buildDncCsv, dncCsvExportFilename, getAllDncSuppressions } from "@/lib/dnc-suppression";

export const runtime = "nodejs";

// Item 5: "ADMIN ONLY should be able to Export the Do Not Contact list as
// CSV" - requireCrmAdmin() is the entire enforcement (no agent-reachable
// code path ever calls this route or getAllDncSuppressions with only an
// agent's own auth).
export async function GET() {
  await requireCrmAdmin();
  const rows = await getAllDncSuppressions();
  return new NextResponse(buildDncCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dncCsvExportFilename("Growth_CRM")}"`,
    },
  });
}
