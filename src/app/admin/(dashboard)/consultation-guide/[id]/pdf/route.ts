import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { renderConsultationGuidePdfBuffer } from "@/lib/consultation-guide-pdf";
import type { CrmConsultationGuideRow } from "@/lib/consultation-guide";

export const runtime = "nodejs";

// Admin-only "Print / Download PDF" - generated on demand from the stored
// guide every time (same convention as the Agreements/Invoices PDF
// downloads), so it always reflects whatever was last saved.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: guide } = await supabase.from("crm_consultation_guides").select("*").eq("id", id).maybeSingle();
  if (!guide) return NextResponse.json({ error: "Consultation guide not found." }, { status: 404 });

  const pdfBuffer = await renderConsultationGuidePdfBuffer(guide as CrmConsultationGuideRow);
  const filename = `Winsalot-Consultation-${(guide.business_name || "Untitled").replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
