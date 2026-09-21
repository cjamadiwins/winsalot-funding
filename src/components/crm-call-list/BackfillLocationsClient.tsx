"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ArrowLeft } from "lucide-react";
import { CALL_LIST_TARGET_FIELD_LABELS, describeHeaderOption, type CallListTargetField } from "@/lib/call-list-column-mapping";
import type { BackfillSummary } from "@/lib/call-list-backfill";

type PreviewResult = { error: string } | { headers: string[]; suggestedMapping: Record<CallListTargetField, string | null>; sampleRowCount: number };

// Fields relevant to a location backfill only - business_name/phone/email
// are shown purely so the Admin can confirm how rows will be MATCHED to
// existing Call List leads; every other imported field (contact name,
// website, industry, notes...) is deliberately never part of this flow,
// since backfill only ever fills in blank location fields, never
// anything else (see src/lib/call-list-backfill.ts).
const BACKFILL_FIELDS: CallListTargetField[] = ["business_name", "phone", "email", "street_address", "city", "province", "postal_code", "country"];

// Admin-only "fix existing Call List/prospect records that never got a
// city" tool (brief's "Existing Imported Lists" section) - re-uploads the
// original (or a corrected) LeadSwift export against an ALREADY-imported
// segment, purely to fill in missing location fields on matching rows.
// Deliberately its own compact, collapsed-by-default panel rather than a
// permanent fixture on the segment page, since it's a one-off cleanup
// action, not a routine part of working a Call List.
export default function BackfillLocationsClient({
  previewAction,
  backfillAction,
}: {
  previewAction: (formData: FormData) => Promise<PreviewResult>;
  backfillAction: (formData: FormData) => Promise<{ error?: string; summary?: BackfillSummary }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BackfillSummary | null>(null);
  const [step, setStep] = useState<"pick" | "mapping">("pick");

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<CallListTargetField, string>>>({});
  const [sampleRowCount, setSampleRowCount] = useState(0);

  function reset() {
    setStep("pick");
    setFile(null);
    setHeaders([]);
    setMapping({});
    setError(null);
    setSummary(null);
  }

  function handleContinue() {
    setError(null);
    if (!file) {
      setError("Choose the CSV or XLSX file to re-check.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await previewAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const initialMapping = {} as Partial<Record<CallListTargetField, string>>;
      for (const field of BACKFILL_FIELDS) {
        const value = result.suggestedMapping[field];
        if (value) initialMapping[field] = value;
      }
      setHeaders(result.headers);
      setMapping(initialMapping);
      setSampleRowCount(result.sampleRowCount);
      setStep("mapping");
    });
  }

  function handleSubmit() {
    if (!file) return;
    setError(null);
    if (!mapping.business_name && !mapping.phone && !mapping.email) {
      setError("Map at least Business Name, Phone, or Email so rows can be matched.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("mapping", JSON.stringify(mapping));
    startTransition(async () => {
      const result = await backfillAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSummary(result.summary ?? null);
      setStep("pick");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-slate-400"
      >
        <MapPin className="h-3.5 w-3.5" /> Update Locations from CSV
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Update Locations from CSV</h3>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Re-upload the original LeadSwift export (or any file with matching Business Name/Phone/Email columns) to fill in
            street address, city, province, postal code, or country on leads already in this segment - and on any prospect
            already promoted from them. This never creates a new lead and never changes contact info, notes, call history,
            status, or assignment; it only fills in currently-blank location fields.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-[12.5px] text-slate-500 hover:text-slate-700"
        >
          Close
        </button>
      </div>

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {summary && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          {summary.rowsInFile} row(s) read · {summary.matched} matched an existing lead · {summary.callListLeadsUpdated} Call List lead(s) updated ·{" "}
          {summary.promotedRecordsUpdated} already-promoted record(s) updated · {summary.unmatched} row(s) didn&apos;t match anything.
        </p>
      )}

      {step === "pick" ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">CSV or XLSX file</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </label>
          <button
            type="button"
            disabled={isPending || !file}
            onClick={handleContinue}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Reading file…" : "Continue"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <button type="button" onClick={() => setStep("pick")} className="inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <p className="mt-2 text-[12.5px] text-slate-500">
              {file?.name} · {headers.length} column(s) detected, {sampleRowCount} row(s). Confirm which column identifies each
              existing lead (Business Name, Phone, and/or Email) and which columns hold the location data to fill in.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BACKFILL_FIELDS.map((field) => (
              <label key={field} className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">{CALL_LIST_TARGET_FIELD_LABELS[field]}</span>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {describeHeaderOption(header)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={isPending}
            onClick={handleSubmit}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Updating…" : "Update Locations"}
          </button>
        </div>
      )}
    </div>
  );
}
