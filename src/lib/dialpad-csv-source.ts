import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Weekly workflow (per spec): Dialpad -> User Statistics -> CSV export ->
// upload CSV to GitHub repo root -> CRM automatically displays the latest
// report. This never reads Group Statistics or Daily Statistics exports -
// those are ignored for the main per-agent report even if their own
// filename date is more recent, since only a User Statistics export has
// one row per agent.

export type DialpadCsvCandidate = {
  fileName: string;
  filePath: string;
  periodStart: string;
  periodEnd: string;
};

// Matches "User_Statistics", "User Statistics", "user-statistics", etc. -
// tolerant of the separator Dialpad/GitHub's upload dialog happens to
// produce, per spec ("spaces vs underscores in filenames").
const USER_STATISTICS_PREFIX = /^user[_\s-]+statistics/i;

function duplicateSuffix(fileName: string): number {
  // "...-20260828 (1).csv" / "...-20260828(2).csv" - GitHub appends this
  // when a same-named file is uploaded more than once; a higher number is
  // the more recently uploaded duplicate.
  const match = fileName.match(/\((\d+)\)\s*\.csv$/i);
  return match ? Number(match[1]) : 0;
}

function periodFromFileName(fileName: string): { periodStart: string; periodEnd: string } | null {
  // "User_Statistics(2026-08-21-2026-08-28)-20260828 (1).csv" - the
  // parenthesized range is the report's actual Monday-through-Sunday
  // period; the trailing "-20260828" is only the export's generation
  // date, never used for period detection when the range is present.
  const rangeMatch = fileName.match(/\((\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\)/);
  if (rangeMatch) return { periodStart: rangeMatch[1], periodEnd: rangeMatch[2] };

  // Fallback for a filename with only a single trailing YYYYMMDD stamp and
  // no explicit range - treated as a one-day period; the caller cross-
  // checks this against the CSV's own "date" column when available.
  const stampMatch = fileName.match(/-(\d{4})(\d{2})(\d{2})(?:\s*\(\d+\))?\.csv$/i);
  if (stampMatch) {
    const iso = `${stampMatch[1]}-${stampMatch[2]}-${stampMatch[3]}`;
    return { periodStart: iso, periodEnd: iso };
  }
  return null;
}

// Scans the given directory (defaults to the repo root, where the weekly
// exports are uploaded) for every valid User Statistics CSV and returns
// the one covering the latest period - never an older file, and never a
// Group Statistics/Daily Statistics export, even when one of those has a
// more recent filename date. A filename this codebase can't confidently
// parse a period from is skipped rather than guessed at, so one oddly
// named file can never silently outrank a real, parseable one.
export function findLatestDialpadUserStatisticsCsv(directory: string = process.cwd()): DialpadCsvCandidate | null {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return null;
  }

  const candidates: DialpadCsvCandidate[] = [];
  for (const fileName of entries) {
    if (!fileName.toLowerCase().endsWith(".csv")) continue;
    if (!USER_STATISTICS_PREFIX.test(fileName)) continue;
    const period = periodFromFileName(fileName);
    if (!period) continue;
    candidates.push({ fileName, filePath: path.join(directory, fileName), ...period });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.periodEnd !== b.periodEnd) return a.periodEnd < b.periodEnd ? 1 : -1;
    if (a.periodStart !== b.periodStart) return a.periodStart < b.periodStart ? 1 : -1;
    return duplicateSuffix(b.fileName) - duplicateSuffix(a.fileName);
  });
  return candidates[0];
}

export function readDialpadCsvFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}
