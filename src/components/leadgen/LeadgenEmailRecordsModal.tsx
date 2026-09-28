"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { LEADGEN_EMAIL_STATUS_LABELS, LEADGEN_EMAIL_STATUS_STYLES } from "@/lib/leadgen-types";
import type { EmailCardRecord } from "@/lib/leadgen-activity-records";
import CrmCardModal from "@/components/crm-ui/CrmCardModal";
import type { KpiTone } from "@/components/crm-ui/KpiCard";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Drill-down for the Lead Gen Performance page's Emails Today/This Week/
// Delivered/Bounced/Failed KPI cards - same CrmCardModal shell as every
// other dashboard stat card. Surfaces the bounce/failure reason (from the
// Resend webhook) whenever one is on file, per the brief's explicit ask.
// Links out to the existing Email Tracking page rather than duplicating its
// resend/history functionality here.
export default function LeadgenEmailRecordsModal({
  label,
  tone,
  icon,
  records,
  emailsHref,
  emptyMessage = "No emails in this period.",
  // Overrides the big number shown on the card (e.g. "8/20" against a
  // daily/weekly target) while the modal's row list still always comes
  // from `records` - defaults to the plain count.
  valueLabel,
}: {
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  records: EmailCardRecord[];
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
      countLabel={`${records.length} email${records.length === 1 ? "" : "s"}`}
    >
      {records.length === 0 ? (
        <div className="py-12 text-center">
          <CircleCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((record) => {
            const failureReason = record.status === "bounced" ? record.bounce_reason : record.status === "failed" ? record.failure_reason : null;
            return (
              <article key={record.id} className="min-w-0 break-words py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{record.to_name ? `${record.to_name} <${record.to_email}>` : record.to_email}</span>
                      <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${LEADGEN_EMAIL_STATUS_STYLES[record.status]}`}>
                        {LEADGEN_EMAIL_STATUS_LABELS[record.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {record.businessName ? `${record.businessName} · ` : ""}Agent: {record.agentName}
                      {record.clientName ? ` · Client: ${record.clientName}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {record.subject} · {formatDate(record.sent_at ?? record.created_at)}
                    </p>
                  </div>
                </div>
                {failureReason && (
                  <p className="mt-2 text-sm text-rose-700">
                    <span className="font-semibold">Reason:</span> {failureReason}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <Link href={emailsHref} className="text-sm font-semibold text-sky-700 hover:underline">
          View full Email Tracking →
        </Link>
      </div>
    </CrmCardModal>
  );
}
