import { NextRequest, NextResponse } from "next/server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { renderProspectProposalPdf } from "@/lib/leadgen-prospect-proposal-pdf";
import type { ProspectProposalContent } from "@/lib/leadgen-prospect-proposal";

export const runtime = "nodejs";

// Admin-only, read-only. Renders the SAVED proposal for this lead as a PDF
// (inline for the preview, as an attachment with ?download=1). Nothing is
// written or sent.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireLeadgenAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const { data } = await getSupabaseAdmin()
    .from("leadgen_prospect_proposals")
    .select("content, attachment_filename")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { content: ProspectProposalContent; attachment_filename: string } | null;
  if (!row) return new NextResponse("No proposal has been prepared for this lead.", { status: 404 });

  const pdf = await renderProspectProposalPdf(row.content);
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${row.attachment_filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
