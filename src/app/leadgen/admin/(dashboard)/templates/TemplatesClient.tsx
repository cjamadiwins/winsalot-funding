"use client";

import { useState, useTransition } from "react";
import type { LeadgenEmailTemplateRow } from "@/lib/leadgen-types";
import { createTemplateAction, updateTemplateAction } from "./actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default function TemplatesClient({ templates }: { templates: LeadgenEmailTemplateRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  return (
    <div>
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Templates ({templates.length})</h2>
        <button type="button" onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
          {showCreate ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {showCreate && (
        <form
          action={(formData) => runAction(() => createTemplateAction(formData), () => setShowCreate(false))}
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Key (unique, lowercase_with_underscores)</span>
              <input name="key" required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Display Name</span>
              <input name="name" required className={inputClass} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Description</span>
            <input name="description" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Subject</span>
            <input name="subject" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Body</span>
            <textarea name="body" required className={`${inputClass} min-h-[180px] resize-y font-mono text-[13px]`} />
          </label>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700">
            Create Template
          </button>
        </form>
      )}

      <div className="mt-4 space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{template.name}</h3>
                <p className="text-[12px] text-slate-500">
                  key: <code>{template.key}</code>
                  {template.description ? ` · ${template.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${template.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                  {template.active ? "Active" : "Inactive"}
                </span>
                <button type="button" onClick={() => setEditingId(editingId === template.id ? null : template.id)} className="text-[12.5px] font-semibold text-sky-600">
                  {editingId === template.id ? "Close" : "Edit"}
                </button>
              </div>
            </div>

            {editingId === template.id ? (
              <form
                action={(formData) => runAction(() => updateTemplateAction(template.id, formData), () => setEditingId(null))}
                className="mt-3 space-y-3"
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Display Name</span>
                  <input name="name" required defaultValue={template.name} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Description</span>
                  <input name="description" defaultValue={template.description ?? ""} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Subject</span>
                  <input name="subject" required defaultValue={template.subject} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-600">Body</span>
                  <textarea name="body" required defaultValue={template.body} className={`${inputClass} min-h-[220px] resize-y font-mono text-[13px]`} />
                </label>
                <label className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" name="active" value="true" defaultChecked={template.active} />
                  Active (selectable when composing an email)
                </label>
                <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700">
                  Save
                </button>
              </form>
            ) : (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[13px] text-slate-700">
                <p className="font-semibold">{template.subject}</p>
                <pre className="mt-2 whitespace-pre-wrap font-sans">{template.body}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
