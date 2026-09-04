import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmSubcontractor } from "@/lib/crm-auth";
import { renderSubcontractorAgreementPdfBuffer } from "@/lib/subcontractor-agreement-pdf";
import type { SubcontractorAgreementRow } from "@/lib/crm-subcontractor-types";

// Self-service twin of the admin PDF route
// (src/app/admin/(dashboard)/crm/subcontractors/[id]/agreement/pdf/route.ts) -
// scoped to the signed-in subcontractor's own agreement only, never an id
// from the request.
export const runtime = "nodejs";

export async function GET() {
  const me = await requireCrmSubcontractor();
  if (!me.subcontractor_id) {
    return NextResponse.json({ error: "No subcontractor profile linked to this account." }, { status: 404 });
  }
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase
    .from("crm_subcontractor_agreements")
    .select("*")
    .eq("subcontractor_id", me.subcontractor_id)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!agreement) {
    return NextResponse.json({ error: "You have not signed an agreement yet." }, { status: 404 });
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
