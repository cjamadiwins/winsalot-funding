import { NextResponse } from "next/server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSegment } from "@/lib/call-list-segments";
import { buildSegmentLeadsCsv, listSegmentLeads } from "@/lib/call-list-leads";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  const segment = await getSegment(id);
  if (!segment || segment.crm !== "lead_generation") {
    return NextResponse.json({ error: "Segment not found." }, { status: 404 });
  }

  const leads = await listSegmentLeads(id);
  const filename = `${segment.name.replace(/[^a-z0-9]+/gi, "_")}.csv`;
  return new NextResponse(buildSegmentLeadsCsv(leads), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
