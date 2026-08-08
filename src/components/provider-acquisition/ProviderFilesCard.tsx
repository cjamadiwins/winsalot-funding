"use client";

import { useState, useTransition } from "react";
import {
  PROVIDER_DOCUMENT_TYPES,
  PROVIDER_DOCUMENT_TYPE_LABELS,
  type ProviderDocumentRow,
  type ProviderDocumentType,
} from "@/lib/provider-types";

export type ProviderDocumentWithUrl = { document: ProviderDocumentRow; url: string | null };

// Files (brief "FILES") - Business Licence, Insurance Certificate,
// WSIB/WCB, Certifications, Other Documents. Agents can upload; only an
// administrator can permanently remove one (onRemove is omitted for
// agents).
export default function ProviderFilesCard({
  documents,
  isAdmin,
  onUpload,
  onRemove,
}: {
  documents: ProviderDocumentWithUrl[];
  isAdmin: boolean;
  onUpload: (formData: FormData) => Promise<{ error?: string } | void>;
  onRemove?: (documentId: string) => Promise<{ error?: string } | void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  return (
    <section id="files" className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Files</h2>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="text-[12.5px] font-semibold text-sky-600">
          {showForm ? "Cancel" : "+ Upload Document"}
        </button>
      </div>

      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}

      {showForm && (
        <form
          action={(formData) => {
            runAction(() => onUpload(formData));
            setShowForm(false);
          }}
          className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3"
        >
          <select name="doc_type" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
            <option value="" disabled>
              Select document type…
            </option>
            {PROVIDER_DOCUMENT_TYPES.map((type: ProviderDocumentType) => (
              <option key={type} value={type}>
                {PROVIDER_DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <input type="file" name="file" required className="w-full text-[13px]" />
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-sky-700">
            Upload
          </button>
        </form>
      )}

      {documents.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">No documents uploaded yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {documents.map(({ document, url }) => (
            <li key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 text-[13px]">
              <div>
                <div className="font-semibold text-slate-900">{PROVIDER_DOCUMENT_TYPE_LABELS[document.doc_type]}</div>
                <div className="text-[12px] text-slate-500">
                  {document.file_name} · Uploaded {new Date(document.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
                    View
                  </a>
                )}
                {isAdmin && onRemove && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (confirm(`Permanently remove "${document.file_name}"?`)) {
                        runAction(() => onRemove(document.id));
                      }
                    }}
                    className="text-[12.5px] font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
