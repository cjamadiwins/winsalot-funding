"use client";

import Link from "next/link";
import StatusBadge from "@/components/crm-ui/StatusBadge";
import { ProgressBar, ProgressStatusText } from "./CallListProgressInfo";
import { formatLastWorked, type CallListProgress } from "@/lib/call-list-progress";
import { CALL_LIST_SEGMENT_STATUS_LABELS, CALL_LIST_SEGMENT_STATUS_STYLES, type CallListSegmentRow } from "@/lib/call-list-types";

// Shared between the Growth CRM and Lead Generation CRM Call List
// Segments list pages - both pass the same row shape so the table stays
// identical instead of drifting between the two CRMs.
export type CallListSegmentRowView = {
  segment: CallListSegmentRow;
  serviceLabel: string;
  agentNames: string[];
  leadCount: number;
  progress: CallListProgress;
};

// Table rows can't carry a separate bar element, so the narrow accent is a
// 4px left border on the row's first cell (same colours as CALL_LIST_PROGRESS_STYLES).
const CALL_LIST_PROGRESS_SIDE_BORDER: Record<CallListProgress["status"], string> = {
  not_started: "border-l-slate-400",
  in_progress: "border-l-emerald-500",
  mostly_worked: "border-l-amber-500",
  completed: "border-l-blue-500",
  paused: "border-l-violet-400",
};

export default function CallListSegmentsClient({ basePath, rows, fixedOwnerLabel }: { basePath: string; rows: CallListSegmentRowView[]; fixedOwnerLabel?: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">No Call List Segments yet.</p>
        <p className="mt-1 text-sm text-slate-500">Upload a CSV or XLSX export to create the first one.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Segment</th>
            <th className="px-3 py-2 font-semibold">Campaign / Service</th>
            {fixedOwnerLabel && <th className="px-3 py-2 font-semibold">Client / Campaign Owner</th>}
            <th className="px-3 py-2 font-semibold">Territory</th>
            <th className="px-3 py-2 font-semibold">Rows</th>
            <th className="px-3 py-2 font-semibold">Assigned Agents</th>
            <th className="px-3 py-2 font-semibold">Worked</th>
            <th className="px-3 py-2 font-semibold">Remaining</th>
            <th className="px-3 py-2 font-semibold">Follow-Ups</th>
            <th className="px-3 py-2 font-semibold">Progress</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Last Worked</th>
            <th className="px-3 py-2 font-semibold">List State</th>
            <th className="px-3 py-2 font-semibold">Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ segment, serviceLabel, agentNames, leadCount, progress }) => (
            <tr key={segment.id} className="align-top">
              <td className={`border-l-4 px-3 py-2.5 ${CALL_LIST_PROGRESS_SIDE_BORDER[progress.status]}`} data-progress-side-bar={progress.status}>
                <Link href={`${basePath}/${segment.id}`} className="font-semibold text-slate-900 hover:underline">
                  {segment.name}
                </Link>
                {segment.source_file_name && <div className="mt-0.5 text-[11.5px] text-slate-500">{segment.source_file_name}</div>}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{serviceLabel}</td>
              {fixedOwnerLabel && <td className="px-3 py-2.5 text-slate-700">{fixedOwnerLabel}</td>}
              <td className="px-3 py-2.5 text-slate-700">{segment.territory || "—"}</td>
              <td className="px-3 py-2.5 text-slate-700">
                {leadCount} / {segment.total_uploaded_rows}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{agentNames.length > 0 ? agentNames.join(", ") : "Unassigned"}</td>
              <td className="px-3 py-2.5 text-slate-700">{progress.workedLeads} / {progress.totalLeads}</td>
              <td className="px-3 py-2.5 text-slate-700">{progress.unworkedLeads}</td>
              <td className="px-3 py-2.5 text-slate-700">{progress.pendingFollowUps}</td>
              <td className="px-3 py-2.5">
                <div className="w-24">
                  <div className="mb-1 text-[12px] font-semibold text-slate-700">{progress.progressPercent}%</div>
                  <ProgressBar progress={progress} />
                </div>
              </td>
              <td className="px-3 py-2.5">
                <ProgressStatusText status={progress.status} />
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                <span suppressHydrationWarning>{formatLastWorked(progress.lastWorkedAt)}</span>
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge label={CALL_LIST_SEGMENT_STATUS_LABELS[segment.status]} className={CALL_LIST_SEGMENT_STATUS_STYLES[segment.status]} />
              </td>
              <td className="px-3 py-2.5 text-slate-600">{new Date(segment.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
