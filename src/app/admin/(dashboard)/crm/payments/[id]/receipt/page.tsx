import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadReceiptByPaymentId } from "@/lib/crm-receipt";
import ReceiptView from "@/components/crm-receipt/ReceiptView";
import ReceiptAdminActions from "@/components/crm-receipt/ReceiptAdminActions";
import { emailPaymentReceiptAction } from "../../actions";

export default async function AdminPaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const receipt = await loadReceiptByPaymentId(supabase, id);
  if (!receipt) notFound();
  const { data: payment } = await supabase
    .from("crm_payments")
    .select("client_id, receipt_email_count, receipt_last_emailed_at, receipt_last_emailed_to")
    .eq("id", id)
    .maybeSingle();

  return (
    <div>
      <Link href={payment ? `/admin/crm/clients/${payment.client_id}` : "/admin/crm/invoices"} className="text-sm text-sky-700 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold text-slate-900">Payment Receipt</h1>
      <ReceiptAdminActions
        paymentId={id}
        defaultEmail={receipt.email ?? ""}
        emailCount={payment?.receipt_email_count ?? 0}
        lastEmailedAt={payment?.receipt_last_emailed_at ?? null}
        lastEmailedTo={payment?.receipt_last_emailed_to ?? null}
        disabled={receipt.status !== "PAID"}
        emailAction={emailPaymentReceiptAction}
      />
      <ReceiptView receipt={receipt} />
    </div>
  );
}
