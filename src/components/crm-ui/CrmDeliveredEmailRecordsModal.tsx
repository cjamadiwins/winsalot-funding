"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { CrmDeliveredEmailCardRecord } from "@/lib/crm-performance";
import CrmCardModal from "./CrmCardModal";
import type { KpiTone } from "./KpiCard";

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Drill-down for the Growth CRM's "Emails Delivered" weekly performance
// tile - the exact records behind computeCrmPeriodPerformance's own
// emailsDelivered count (see computeCrmPeriodDeliveredEmailRecords), so the
// tile's number can never disagree with what clicking it shows. Links out
// to the existing Email Tracking page rather than duplicating its
// resend/history functionality here.
export default function CrmDeliveredEmailRecordsModal({
  label,
  tone,
  icon,
  records,
  opportunityHrefBase,
  emailsHref,
  emptyMessage = "No delivered emails in this period.",
  // Overrides the big number shown on the card (e.g. "3/12" against the
  // weekly target) while the modal's row list still always comes from
  // `records` - defaults to the plain count.
  valueLabel,
}: {
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  records: CrmDeliveredEmailCardRecord[];
  opportunityHrefBase: string;
  emailsHref: string;
  emptyMessage?: string;
  valueLabel?: string;
}) {
  return (
    <CrmCardModal
      label={label}
      value={valueLabel ?? records.length}
      tone={tone}
      icon={icon}
      title={label}
      countLabel={`${records.length} delivered email${records.length === 1 ? "" : "s"}`}
    >
      {records.length === 0 ? (
        <div className="py-12 text-center">
          <CircleCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((record) => (
            <article key={record.emailId} className="min-w-0 break-words py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`${opportunityHrefBase}/${record.opportunityId}`} className="font-bold text-slate-900 hover:text-sky-700 hover:underline">
                  {record.businessName}
                </Link>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Delivered</span>
              </div>
              <p className="mt-1 text-[12.5px] text-slate-500">To: {record.toEmail}</p>
              <p className="mt-1 text-[12.5px] text-slate-500">
                {record.subject} · {formatDate(record.deliveredAt)}
              </p>
            </article>
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <Link href={emailsHref} className="text-[12.5px] font-semibold text-sky-700 hover:underline">
          View full Email Tracking →
        </Link>
      </div>
    </CrmCardModal>
  );
}
