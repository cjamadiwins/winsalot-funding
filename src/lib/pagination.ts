export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export function getTotalPages(totalRecords: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalRecords / Math.max(1, pageSize)));
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
}

// 1-based inclusive record range shown on a page ([0, 0] when empty).
export function getPageRange(page: number, pageSize: number, totalRecords: number): [number, number] {
  if (totalRecords === 0) return [0, 0];
  const start = (page - 1) * pageSize + 1;
  return [start, Math.min(totalRecords, page * pageSize)];
}

// Page numbers to render: always first/last, current +/- 1, with "…" gaps.
export function getPageWindow(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const keep = new Set([1, totalPages, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (current >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => keep.add(n));
  const pages = [...keep].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}
