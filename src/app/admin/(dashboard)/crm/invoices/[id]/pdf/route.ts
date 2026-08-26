import { NextRequest, NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { fetchInvoiceDetail } from "@/lib/crm-invoices-data";
import { renderInvoicePdfBuffer } from "@/lib/crm-invoice-pdf";

export const runtime = "nodejs";

// "Download as professional PDF" - gated by requireCrmAdmin() same as
// every other invoice route, not just a hidden button in the UI.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: detail, error } = await fetchInvoiceDetail(supabase, id);
  if (error || !detail) {
    return NextResponse.json({ error: error ?? "Invoice not found." }, { status: 404 });
  }

  const pdfBuffer = await renderInvoicePdfBuffer({
    invoice: detail.invoice,
    clientCompanyName: detail.client?.company_name ?? "Client",
    lineItems: detail.lineItems,
  });

  await supabase.from("crm_invoice_audit").insert({
    invoice_id: detail.invoice.id,
    client_id: detail.invoice.client_id,
    invoice_number: detail.invoice.invoice_number,
    action: "pdf_downloaded",
    performed_by_name: admin.full_name || admin.email,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${detail.invoice.invoice_number}.pdf"`,
    },
  });
}
