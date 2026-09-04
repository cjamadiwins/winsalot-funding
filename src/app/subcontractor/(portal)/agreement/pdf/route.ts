import { NextResponse } from "next/server";
import { requireGrowthSubcontractor } from "@/lib/subcontractor-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { renderSubcontractorAgreementPdf } from "@/lib/subcontractor-agreement-pdf";
import type { SubcontractorAgreementRow } from "@/lib/subcontractor-payroll";

export const runtime = "nodejs";
export async function GET() {
  const subcontractor = await requireGrowthSubcontractor(); const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("crm_subcontractor_agreements").select("*").eq("subcontractor_id", subcontractor.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!data) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  const pdf = await renderSubcontractorAgreementPdf({ subcontractor, agreement: data as SubcontractorAgreementRow });
  const name = subcontractor.full_name.replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Winsalot-Subcontractor-Agreement-${name}.pdf"` } });
}
