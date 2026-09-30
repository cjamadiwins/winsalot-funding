"use client";

import { useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/crm-ui/StatusBadge";
import { ProgressBar, ProgressSideBar, ProgressStatusText } from "./CallListProgressInfo";
import { formatLastWorked, type CallListProgress } from "@/lib/call-list-progress";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, clampPage, getPageRange, getPageWindow, getTotalPages } from "@/lib/pagination";
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

// `compact` is an opt-in dense layout (used by the Growth CRM only): tighter
// padding, right-aligned tabular numerics, inline progress bar, and no
// left-side row bar - colour is confined to the status/progress cells. The
// default layout (Lead Generation CRM) is unchanged.
export default function CallListSegmentsClient({ basePath, rows, fixedOwnerLabel, compact = false, longNames = false }: { basePath: string; rows: CallListSegmentRowView[]; fixedOwnerLabel?: string; compact?: boolean; longNames?: boolean }) {
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [requestedPage, setRequestedPage] = useState(1);
  const totalPages = getTotalPages(rows.length, pageSize);
  const page = clampPage(requestedPage, totalPages);
  const allRows = rows;
  rows = allRows.slice((page - 1) * pageSize, page * pageSize);
  const pagination = (
    <PaginationBar
      page={page}
      totalPages={totalPages}
      pageSize={pageSize}
      totalRecords={allRows.length}
      onPage={setRequestedPage}
      onPageSize={(size) => {
        setPageSize(size);
        setRequestedPage(1);
      }}
    />
  );

  if (allRows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">No Call List Segments yet.</p>
        <p className="mt-1 text-sm text-slate-500">Upload a CSV or XLSX export to create the first one.</p>
      </div>
    );
  }

  if (compact)
    return (
      <div>
        <CompactTable basePath={basePath} rows={rows} fixedOwnerLabel={fixedOwnerLabel} longNames={longNames} />
        {pagination}
      </div>
    );

  return (
    <div>
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
              <td className="relative py-2.5 pl-5 pr-3">
                {/* Per-row rounded status bar, inset top/bottom so it never touches the next list's bar or the table border. */}
                <ProgressSideBar status={progress.status} className="absolute bottom-2 left-2 top-2" />
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
    {pagination}
    </div>
  );
}

// `longNames` (Lead Generation) gives the Segment column more room because its
// segment names are long; the Growth widths below are left exactly as shipped.
function CompactTable({ basePath, rows, fixedOwnerLabel, longNames = false }: { basePath: string; rows: CallListSegmentRowView[]; fixedOwnerLabel?: string; longNames?: boolean }) {
  const segmentWidth = longNames ? "min-w-[180px] max-w-[270px]" : "max-w-[170px]";
  const serviceWidth = longNames ? "min-w-[130px] max-w-[190px]" : "min-w-[150px] max-w-[230px]";
  const th = "px-1.5 py-1.5 font-semibold";
  const thNum = `${th} text-right`;
  const td = "px-1.5 py-1.5 text-slate-700";
  const tdNum = `${td} whitespace-nowrap text-right tabular-nums`;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-[12px] leading-snug">
        <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className={th}>Segment</th>
            <th className={th}>Campaign / Service</th>
            {fixedOwnerLabel && <th className={th}>Client / Campaign Owner</th>}
            <th className={th}>Territory</th>
            <th className={thNum}>Rows</th>
            <th className={th}>Assigned Agents</th>
            <th className={thNum}>Worked</th>
            <th className={thNum}>Remaining</th>
            <th className={thNum}>Follow-Ups</th>
            <th className={th}>Progress / Status</th>
            <th className={th}>Last Worked</th>
            <th className={th}>List State / Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ segment, serviceLabel, agentNames, leadCount, progress }) => (
            <tr key={segment.id} className="align-middle hover:bg-slate-50/60">
              <td className={`${segmentWidth} px-1.5 py-1.5`}>
                <Link href={`${basePath}/${segment.id}`} className="font-semibold text-slate-900 hover:underline">
                  {segment.name}
                </Link>
                {segment.source_file_name && (
                  <div title={segment.source_file_name} className="truncate text-[10.5px] text-slate-400">
                    {segment.source_file_name}
                  </div>
                )}
              </td>
              <td className={`${td} ${serviceWidth}`}>
                <span title={serviceLabel} className="line-clamp-2">{serviceLabel}</span>
              </td>
              {fixedOwnerLabel && <td className={`${td} whitespace-nowrap`}>{fixedOwnerLabel}</td>}
              <td className={`${td} min-w-[70px]`}>{segment.territory || "—"}</td>
              <td className={tdNum}>
                {leadCount} / {segment.total_uploaded_rows}
              </td>
              <td className={`${td} min-w-[90px] font-medium text-slate-800`}>{agentNames.length > 0 ? agentNames.join(", ") : "Unassigned"}</td>
              <td className={tdNum}>
                {progress.workedLeads} / {progress.totalLeads}
              </td>
              <td className={tdNum}>{progress.unworkedLeads}</td>
              <td className={tdNum}>{progress.pendingFollowUps}</td>
              <td className="px-1.5 py-1.5">
                <div className="flex w-32 items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <ProgressBar progress={progress} />
                  </div>
                  <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-slate-700">{progress.progressPercent}%</span>
                </div>
                <div className="mt-0.5 whitespace-nowrap">
                  <ProgressStatusText status={progress.status} />
                </div>
              </td>
              <td className={`${td} whitespace-nowrap text-slate-600`}>
                <span suppressHydrationWarning>{formatLastWorked(progress.lastWorkedAt)}</span>
              </td>
              <td className="whitespace-nowrap px-1.5 py-1.5">
                <StatusBadge label={CALL_LIST_SEGMENT_STATUS_LABELS[segment.status]} className={CALL_LIST_SEGMENT_STATUS_STYLES[segment.status]} />
                <div className="mt-0.5 text-[10.5px] text-slate-500">{new Date(segment.created_at).toLocaleDateString()}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaginationBar({ page, totalPages, pageSize, totalRecords, onPage, onPageSize }: { page: number; totalPages: number; pageSize: number; totalRecords: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const [from, to] = getPageRange(page, pageSize, totalRecords);
  const btn = "rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="Call list pagination" className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px] text-slate-600">
      <div>
        Showing <span className="font-semibold text-slate-800">{from}–{to}</span> of <span className="font-semibold text-slate-800">{totalRecords}</span> records · Page {page} of {totalPages}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="mr-2 flex items-center gap-1.5">
          Rows per page
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[12px]">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        {getPageWindow(page, totalPages).map((entry, i) =>
          entry === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-current={entry === page ? "page" : undefined}
              className={entry === page ? "rounded-md border border-slate-800 bg-slate-800 px-2.5 py-1 text-[12px] font-semibold text-white" : btn}
              onClick={() => onPage(entry)}
            >
              {entry}
            </button>
          )
        )}
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
