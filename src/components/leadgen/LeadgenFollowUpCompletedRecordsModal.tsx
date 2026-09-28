"use client";

import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { FollowUpCompletedCardRecord } from "@/lib/leadgen-activity-records";
import CrmCardModal from "@/components/crm-ui/CrmCardModal";
import type { KpiTone } from "@/components/crm-ui/KpiCard";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Drill-down for the Lead Gen Performance page's "Follow-Ups Completed
// (Week)" KPI card - same CrmCardModal shell as every other dashboard stat
// card. Distinct from LeadgenLeadRecordsModal's Follow-Ups Due/Overdue
// cards (pending, not yet done) - this shows what was actually closed out.
export default function LeadgenFollowUpCompletedRecordsModal({
  label,
  tone,
  icon,
  records,
  emptyMessage = "No follow-ups completed in this period.",
}: {
  label: string;
  tone: KpiTone;
  icon: ReactNode;
  records: FollowUpCompletedCardRecord[];
  emptyMessage?: string;
}) {
  return (
    <CrmCardModal
      label={label}
      value={records.length}
      tone={tone}
      icon={icon}
      title={label}
      countLabel={`${records.length} follow-up${records.length === 1 ? "" : "s"} completed`}
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900">{record.businessName}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-800">Completed</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Agent: {record.agentName} · {formatDate(record.completed_at)}
              </p>
              {record.note && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Note:</span> {record.note}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </CrmCardModal>
  );
}
