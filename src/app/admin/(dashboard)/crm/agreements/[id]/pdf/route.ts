import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { renderAgreementPdfBuffer } from "@/lib/crm-agreement-pdf";
import type { CrmAgreementTemplateRow, CrmClientAgreementRow } from "@/lib/crm-agreement-types";

export const runtime = "nodejs";

// Admin-only signed-agreement PDF download (item 5/11: "generate a
// downloadable PDF" / "Download Signed Agreement"). Generated on demand
// from the stored agreement row every time - never a stored file - so it
// always reflects exactly what's in the database, and a signed
// agreement's own immutability trigger guarantees that never changes.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: agreement } = await supabase.from("crm_client_agreements").select("*").eq("id", id).maybeSingle();
  if (!agreement) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });

  const { data: template } = await supabase.from("crm_agreement_templates").select("*").eq("id", agreement.template_id).maybeSingle();
  if (!template) return NextResponse.json({ error: "Agreement template not found." }, { status: 404 });

  const pdfBuffer = await renderAgreementPdfBuffer({
    agreement: agreement as CrmClientAgreementRow,
    template: template as Pick<CrmAgreementTemplateRow, "content">,
  });

  const filename = `Winsalot-Corp-Agreement-${(agreement.legal_business_name as string).replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
