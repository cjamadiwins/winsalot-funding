"use client";

import { useState, useTransition } from "react";
import { UploadCloud, ArrowLeft } from "lucide-react";
import {
  CALL_LIST_TARGET_FIELDS,
  CALL_LIST_TARGET_FIELD_LABELS,
  CALL_LIST_REQUIRED_FIELDS,
  describeHeaderOption,
  type CallListTargetField,
} from "@/lib/call-list-column-mapping";
import { suggestSegmentNameFromFilename } from "@/lib/call-list-filename";

type PreviewResult = { error: string } | { headers: string[]; suggestedMapping: Record<CallListTargetField, string | null>; sampleRowCount: number };

export default function UploadSegmentClient({
  typeOptions,
  typeFieldLabel,
  typeFieldName,
  previewAction,
  uploadAction,
}: {
  typeOptions: { value: string; label: string }[];
  typeFieldLabel: string;
  typeFieldName: string;
  previewAction: (formData: FormData) => Promise<PreviewResult>;
  uploadAction: (formData: FormData) => Promise<{ error: string } | void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"details" | "mapping">("details");

  // Step 1 fields. Segment Name starts genuinely blank (no example/
  // placeholder text) and is only ever auto-filled from the chosen
  // file's name while the Admin hasn't typed into it themselves -
  // hasEditedName flips true the moment they do, and a later file pick
  // never overwrites it after that.
  const [name, setName] = useState("");
  const [hasEditedName, setHasEditedName] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [industry, setIndustry] = useState("");
  const [territory, setTerritory] = useState("");
  const [typeValue, setTypeValue] = useState(typeOptions[0]?.value ?? "");
  const [file, setFile] = useState<File | null>(null);

  // Step 2 (Map Columns) state.
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<CallListTargetField, string>>>({});
  const [sampleRowCount, setSampleRowCount] = useState(0);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    if (selected && !hasEditedName) {
      const suggestion = suggestSegmentNameFromFilename(selected.name);
      if (suggestion) setName(suggestion);
    }
  }

  function handleContinue() {
    setError(null);
    if (!name.trim()) {
      setError("Segment name is required.");
      return;
    }
    if (!file) {
      setError("Choose a CSV or XLSX file to upload.");
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
      for (const field of CALL_LIST_TARGET_FIELDS) {
        const value = result.suggestedMapping[field];
        if (value) initialMapping[field] = value;
      }
      setHeaders(result.headers);
      setMapping(initialMapping);
      setSampleRowCount(result.sampleRowCount);
      setStep("mapping");
    });
  }

  function handleUpload() {
    if (!file) return;
    setError(null);
    if (!mapping.business_name) {
      setError("Map a column to Business Name before continuing.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("name", name);
    formData.set("campaign_name", campaignName);
    formData.set("industry", industry);
    formData.set("territory", territory);
    formData.set(typeFieldName, typeValue);
    formData.set("mapping", JSON.stringify(mapping));
    startTransition(async () => {
      const result = await uploadAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  if (step === "mapping") {
    return (
      <div className="space-y-5 rounded-xl border border-slate-200 p-5">
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <div>
          <button
            type="button"
            onClick={() => setStep("details")}
            className="inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">Map Columns</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {file?.name} · {headers.length} column(s) detected, {sampleRowCount} row(s). Confirm which uploaded column
            corresponds to each field below - Business Name is the only one required. Anything left unmapped, or any
            column not used here, is kept and still editable in the next screen.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CALL_LIST_TARGET_FIELDS.filter((field) => field !== "notes").map((field) => (
            <label key={field} className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {CALL_LIST_TARGET_FIELD_LABELS[field]}
                {CALL_LIST_REQUIRED_FIELDS.includes(field) && <span className="text-rose-600"> *</span>}
              </span>
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

        <div className="flex justify-end">
          <button
            type="button"
            disabled={isPending || !mapping.business_name}
            onClick={handleUpload}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Uploading…" : "Upload & Continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 p-5">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          Segment Name <span className="text-rose-600">*</span>
        </span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setHasEditedName(true);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {file && !name.trim() && <p className="mt-1 text-[11.5px] text-slate-500">Enter a name to continue.</p>}
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Campaign Name</span>
          <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Industry</span>
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Location / Territory</span>
          <input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">{typeFieldLabel}</span>
          <select value={typeValue} onChange={(e) => setTypeValue(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          Upload File (CSV or XLSX) <span className="text-rose-600">*</span>
        </span>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
          <UploadCloud className="h-5 w-5 shrink-0 text-slate-400" />
          <div className="flex-1 text-left">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
            {file && <p className="mt-1 text-[12px] text-slate-500">{file.name}</p>}
          </div>
        </div>
      </label>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={isPending}
          onClick={handleContinue}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Reading file…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
