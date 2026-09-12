"use client";

// Small, shared "rows per page" control + pagination logic for the
// Opportunity Finder list views (both CRMs, admin and agent). Kept as a
// plain hook + a compact footer control rather than a component that owns
// the list itself, so each caller's existing filtering/sorting stays
// exactly as-is - this only slices whatever array the caller already
// computed and resets to page 1 whenever that array (a new reference every
// time the caller's own filters change, since it's built with useMemo) or
// the page size changes. Reset happens during render itself - see "Adjusting
// state when a prop changes" in the React docs - rather than in a useEffect,
// which would cost an extra render and trip the set-state-in-effect lint rule.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50] as const;
export type RowsPerPage = (typeof ROWS_PER_PAGE_OPTIONS)[number];

export function usePagedRows<T>(rows: T[], initialPageSize: RowsPerPage = 10) {
  const [pageSize, setPageSize] = useState<RowsPerPage>(initialPageSize);
  const [page, setPage] = useState(1);
  const [resetKey, setResetKey] = useState<{ rows: T[]; pageSize: RowsPerPage }>({ rows, pageSize });

  let currentPage = page;
  if (resetKey.rows !== rows || resetKey.pageSize !== pageSize) {
    setResetKey({ rows, pageSize });
    currentPage = 1;
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);

  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return { pageRows, page: safePage, pageCount, pageSize, setPage, setPageSize, totalCount: rows.length, rangeStart: rows.length === 0 ? 0 : start + 1, rangeEnd: Math.min(start + pageSize, rows.length) };
}

export default function RowsPerPagePager({
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  totalCount,
  rangeStart,
  rangeEnd,
}: {
  page: number;
  pageCount: number;
  pageSize: RowsPerPage;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: RowsPerPage) => void;
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-slate-600">
      <span>
        {totalCount === 0 ? "No opportunities" : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value) as RowsPerPage)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-[12.5px]"
          >
            {ROWS_PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            className="rounded-full border border-slate-300 p-1.5 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[64px] text-center font-medium text-slate-700">
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            className="rounded-full border border-slate-300 p-1.5 text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
