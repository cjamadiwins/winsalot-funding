import "server-only";
import * as XLSX from "xlsx";
import { parseCsvRows } from "./leadgen-csv";

// Parses an uploaded LeadSwift (or any other) CSV/XLSX export into a
// plain headers+rows grid, the same shape the old Google Sheets version
// of this feature worked with - everything downstream (column mapping,
// duplicate detection) is unchanged by where the grid came from.
export type ParsedUploadFile = {
  fileType: "csv" | "xlsx";
  headers: string[];
  rows: string[][];
};

// A sane upper bound so a mis-exported, enormous file fails fast with a
// clear message instead of timing out the request or the database call
// that follows.
const MAX_ROWS = 20000;

export function detectUploadFileType(filename: string): "csv" | "xlsx" | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  return null;
}

export function parseUploadedFile(filename: string, buffer: Buffer): ParsedUploadFile {
  const fileType = detectUploadFileType(filename);
  if (!fileType) {
    throw new Error("Unsupported file type - please upload a .csv or .xlsx file.");
  }

  let rawRows: string[][];
  if (fileType === "csv") {
    rawRows = parseCsvRows(buffer.toString("utf8"));
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("This spreadsheet has no sheets.");
    const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    rawRows = grid.map((row) => row.map((cell) => String(cell ?? "").trim()));
  }

  const nonEmptyRows = rawRows.filter((row) => row.some((cell) => (cell ?? "").toString().trim().length > 0));
  if (nonEmptyRows.length === 0) {
    throw new Error("This file has no data.");
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  const headers = headerRow.map((cell) => cell.trim());
  if (headers.every((header) => !header)) {
    throw new Error("The first row must contain column headers.");
  }
  if (dataRows.length > MAX_ROWS) {
    throw new Error(`This file has ${dataRows.length} rows - please split it into batches of ${MAX_ROWS} or fewer and upload each as its own segment.`);
  }

  const rows = dataRows.map((row) => headers.map((_, i) => (row[i] ?? "").toString().trim()));
  return { fileType, headers, rows };
}
