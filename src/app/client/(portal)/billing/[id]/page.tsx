import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { loadPortalReceipt } from "@/lib/crm-portal-billing";
import ReceiptView from "@/components/crm-receipt/ReceiptView";

export default async function ClientPortalReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { client } = await requireLeadgenPortalClient();
  const { id } = await params;
  const receipt = await loadPortalReceipt(client.id, id);
  if (!receipt) notFound();

  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between">
        <Link href="/client/billing" className="text-sm text-sky-700 hover:underline">
          ← Billing &amp; Payments
        </Link>
        <a href={`/client/billing/${id}/pdf`} className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700">
          Download PDF
        </a>
      </div>
      <ReceiptView receipt={receipt} />
    </div>
  );
}
