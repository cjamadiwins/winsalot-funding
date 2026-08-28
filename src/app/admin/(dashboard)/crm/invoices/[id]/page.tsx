import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { fetchInvoiceDetail } from "@/lib/crm-invoices-data";
import InvoiceDetailClient from "@/components/crm-invoices/InvoiceDetailClient";
import {
  updateInvoiceAction,
  duplicateInvoiceAction,
  previewInvoiceEmailAction,
  sendInvoiceAction,
  recordInvoicePaymentAction,
  reverseInvoicePaymentAction,
  markInvoicePaidAction,
  markInvoicePartiallyPaidAction,
  cancelInvoiceAction,
  archiveInvoiceAction,
  deleteInvoiceAction,
  deleteTestInvoiceAction,
  deleteTestPaymentAction,
  sendInvoiceReceiptAction,
} from "../actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCrmAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: detail, error } = await fetchInvoiceDetail(supabase, id);
  if (error || !detail) notFound();

  return (
    <div>
      <Suspense>
        <InvoiceDetailClient
          detail={detail}
          updateAction={updateInvoiceAction}
          duplicateAction={duplicateInvoiceAction}
          previewEmailAction={previewInvoiceEmailAction}
          sendAction={sendInvoiceAction}
          recordPaymentAction={recordInvoicePaymentAction}
          reversePaymentAction={reverseInvoicePaymentAction}
          markPaidAction={markInvoicePaidAction}
          markPartiallyPaidAction={markInvoicePartiallyPaidAction}
          cancelAction={cancelInvoiceAction}
          archiveAction={archiveInvoiceAction}
          deleteAction={deleteInvoiceAction}
          deleteTestInvoiceAction={deleteTestInvoiceAction}
          deleteTestPaymentAction={deleteTestPaymentAction}
          sendReceiptAction={sendInvoiceReceiptAction}
        />
      </Suspense>
    </div>
  );
}
