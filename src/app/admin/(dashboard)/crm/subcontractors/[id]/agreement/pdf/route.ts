import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { renderSubcontractorAgreementPdfBuffer } from "@/lib/subcontractor-agreement-pdf";
import type { SubcontractorAgreementRow } from "@/lib/crm-subcontractor-types";

// @react-pdf/renderer needs Node, not the Edge runtime - same requirement
// as the Client Service Agreement PDF route this mirrors
// (src/app/admin/(dashboard)/crm/agreements/[id]/pdf/route.ts).
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase
    .from("crm_subcontractor_agreements")
    .select("*")
    .eq("subcontractor_id", id)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!agreement) {
    return NextResponse.json({ error: "No signed agreement found for this subcontractor." }, { status: 404 });
  }

  const pdfBuffer = await renderSubcontractorAgreementPdfBuffer({ agreement: agreement as SubcontractorAgreementRow });
  const filename = `Independent-Contractor-Agreement-${(agreement.contractor_name_typed as string).replace(/\s+/g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
