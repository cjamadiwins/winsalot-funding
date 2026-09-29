import { NextRequest, NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadReceiptByPaymentId, receiptFilename } from "@/lib/crm-receipt";
import { renderReceiptPdfBuffer } from "@/lib/crm-receipt-pdf";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const receipt = await loadReceiptByPaymentId(await createSupabaseServerClient(), id);
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  const pdf = await renderReceiptPdfBuffer(receipt);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${receiptFilename(receipt)}"` },
  });
}
