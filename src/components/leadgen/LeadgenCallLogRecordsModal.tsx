"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { CALL_LOG_OUTCOME_STYLES, formatCallLogDate, isCallLogOutcome } from "@/lib/call-log";
import type { CallLogCardRecord } from "@/lib/leadgen-activity-records";
import CrmCardModal from "@/components/crm-ui/CrmCardModal";
import type { KpiTone } from "@/components/crm-ui/KpiCard";

// Drill-down for the Lead Gen Performance page's Calls Today/This Week KPI
// cards - same CrmCardModal shell as every other dashboard stat card. Links
// out to the existing Call Log page (already filterable by agent/date/
// outcome) rather than duplicating its edit/export functionality here.
export default function LeadgenCallLogRecordsModal({
  label,
  tone,
  icon,
  records,
  callLogHref,
  emptyMessage = "No calls logged in this period.",
  // Overrides the big number shown on the card (e.g. "42/80" against a
  // daily/weekly target) while the modal's row list still always comes
  // from `records` - defaults to the plain count.
  valueLabel,
}: {
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  records: CallLogCardRecord[];
  callLogHref: string;
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
      countLabel={`${records.length} call${records.length === 1 ? "" : "s"}`}
    >
      {records.length === 0 ? (
        <div className="py-12 text-center">
          <CircleCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((record) => (
            <article key={record.id} className="min-w-0 break-words py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{record.business_name}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        isCallLogOutcome(record.outcome) ? CALL_LOG_OUTCOME_STYLES[record.outcome] : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {record.outcome}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    {record.phone} · Agent: {record.agentName}
                    {record.clientName ? ` · Client: ${record.clientName}` : ""}
                  </p>
                  <p className="mt-1 text-[12.5px] text-slate-500">{formatCallLogDate(record.created_at)}</p>
                </div>
              </div>
              {record.notes && (
                <p className="mt-2 text-[12.5px] text-slate-600">
                  <span className="font-semibold text-slate-700">Notes:</span> {record.notes}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <Link href={callLogHref} className="text-[12.5px] font-semibold text-sky-700 hover:underline">
          View full Call Log →
        </Link>
      </div>
    </CrmCardModal>
  );
}
