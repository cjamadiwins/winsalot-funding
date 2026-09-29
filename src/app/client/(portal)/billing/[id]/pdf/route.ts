import { NextRequest, NextResponse } from "next/server";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { loadPortalReceipt } from "@/lib/crm-portal-billing";
import { receiptFilename } from "@/lib/crm-receipt";
import { renderReceiptPdfBuffer } from "@/lib/crm-receipt-pdf";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { client } = await requireLeadgenPortalClient();
  const { id } = await params;
  const receipt = await loadPortalReceipt(client.id, id);
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  const pdf = await renderReceiptPdfBuffer(receipt);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${receiptFilename(receipt)}"` },
  });
}
