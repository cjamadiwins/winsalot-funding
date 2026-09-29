import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { buildReceiptData, RECEIPT_PAYMENT_COLUMNS, type ReceiptData } from "./crm-receipt";

// Client-portal billing: crm_payments is admin-only under RLS (it also
// holds internal notes), so the portal reads it server-side, scoped to the
// authenticated portal user's own client (crm_clients.leadgen_client_id),
// selecting client-safe columns only. Reversed payments are never shown.
async function portalCrmClientIds(leadgenClientId: string): Promise<string[]> {
  const { data } = await getSupabaseAdmin().from("crm_clients").select("id").eq("leadgen_client_id", leadgenClientId);
  return (data ?? []).map((row) => row.id as string);
}

export async function loadPortalReceipts(leadgenClientId: string): Promise<ReceiptData[]> {
  const db = getSupabaseAdmin();
  const clientIds = await portalCrmClientIds(leadgenClientId);
  if (clientIds.length === 0) return [];
  const { data: payments } = await db
    .from("crm_payments")
    .select(RECEIPT_PAYMENT_COLUMNS)
    .in("client_id", clientIds)
    .is("reversed_at", null)
    .not("receipt_number", "is", null)
    .order("payment_date", { ascending: false });
  const receipts = await Promise.all((payments ?? []).map((p) => buildReceiptData(db, p as never)));
  return receipts.filter((r): r is ReceiptData => r !== null);
}

export async function loadPortalReceipt(leadgenClientId: string, paymentId: string): Promise<ReceiptData | null> {
  const db = getSupabaseAdmin();
  const clientIds = await portalCrmClientIds(leadgenClientId);
  if (clientIds.length === 0) return null;
  const { data: payment } = await db
    .from("crm_payments")
    .select(RECEIPT_PAYMENT_COLUMNS)
    .eq("id", paymentId)
    .in("client_id", clientIds)
    .is("reversed_at", null)
    .maybeSingle();
  return payment ? buildReceiptData(db, payment as never) : null;
}
