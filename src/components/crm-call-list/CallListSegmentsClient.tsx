"use client";

import Link from "next/link";
import StatusBadge from "@/components/crm-ui/StatusBadge";
import { CALL_LIST_SEGMENT_STATUS_LABELS, CALL_LIST_SEGMENT_STATUS_STYLES, type CallListSegmentRow } from "@/lib/call-list-types";

// Shared between the Growth CRM and Lead Generation CRM Call List
// Segments list pages - both pass the same row shape so the table stays
// identical instead of drifting between the two CRMs.
export type CallListSegmentRowView = {
  segment: CallListSegmentRow;
  serviceLabel: string;
  agentNames: string[];
  leadCount: number;
};

export default function CallListSegmentsClient({ basePath, rows }: { basePath: string; rows: CallListSegmentRowView[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">No Call List Segments yet.</p>
        <p className="mt-1 text-sm text-slate-500">Upload a CSV or XLSX export to create the first one.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Segment</th>
            <th className="px-3 py-2 font-semibold">Campaign / Service</th>
            <th className="px-3 py-2 font-semibold">Territory</th>
            <th className="px-3 py-2 font-semibold">Rows</th>
            <th className="px-3 py-2 font-semibold">Assigned Agents</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ segment, serviceLabel, agentNames, leadCount }) => (
            <tr key={segment.id} className="align-top">
              <td className="px-3 py-2.5">
                <Link href={`${basePath}/${segment.id}`} className="font-semibold text-slate-900 hover:underline">
                  {segment.name}
                </Link>
                {segment.source_file_name && <div className="mt-0.5 text-[11.5px] text-slate-500">{segment.source_file_name}</div>}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{serviceLabel}</td>
              <td className="px-3 py-2.5 text-slate-700">{segment.territory || "—"}</td>
              <td className="px-3 py-2.5 text-slate-700">
                {leadCount} / {segment.total_uploaded_rows}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{agentNames.length > 0 ? agentNames.join(", ") : "Unassigned"}</td>
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
