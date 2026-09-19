"use client";

import { useRef, useState, useTransition } from "react";
import { UploadCloud } from "lucide-react";

export default function UploadSegmentClient({
  typeOptions,
  typeFieldLabel,
  typeFieldName,
  uploadAction,
}: {
  typeOptions: { value: string; label: string }[];
  typeFieldLabel: string;
  typeFieldName: string;
  uploadAction: (formData: FormData) => Promise<{ error: string } | void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const result = await uploadAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 p-5">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          Segment Name <span className="text-rose-600">*</span>
        </span>
        <input name="name" required placeholder="e.g. Toronto Roofers – Q3 LeadSwift Export" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Campaign Name</span>
          <input name="campaign_name" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Industry</span>
          <input name="industry" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Location / Territory</span>
          <input name="territory" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">{typeFieldLabel}</span>
          <select name={typeFieldName} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
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
              name="file"
              required
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
            {fileName && <p className="mt-1 text-[12px] text-slate-500">{fileName}</p>}
          </div>
        </div>
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Uploading…" : "Upload & Continue"}
        </button>
      </div>
    </form>
  );
}
