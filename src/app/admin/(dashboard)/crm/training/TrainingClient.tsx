"use client";

import { useState, useTransition } from "react";
import type { CrmTrainingMaterialRow } from "@/lib/crm-types";
import {
  createTrainingMaterialAction,
  deleteTrainingMaterialAction,
  updateTrainingMaterialAction,
} from "./actions";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function TrainingClient({ materials }: { materials: CrmTrainingMaterialRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string } | void>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result?.error) {
          setError(result.error);
          return;
        }
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button type="button" onClick={() => setShowAdd((v) => !v)} className={buttonClasses}>
        {showAdd ? "Cancel" : "+ Add Training Material"}
      </button>

      {showAdd && (
        <form
          action={(formData) =>
            runAction(
              () => createTrainingMaterialAction(formData),
              () => setShowAdd(false)
            )
          }
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <input name="title" placeholder="Title" required className={inputClasses} />
          <textarea
            name="content"
            placeholder="Script or training content"
            required
            rows={8}
            className={`${inputClasses} font-mono`}
          />
          <button type="submit" disabled={isPending} className={buttonClasses}>
            Save
          </button>
        </form>
      )}

      <div className="mt-6 space-y-4">
        {materials.map((material) => (
          <div key={material.id} className="rounded-2xl border border-slate-200 bg-white p-6">
            {editingId === material.id ? (
              <form
                action={(formData) =>
                  runAction(
                    () => updateTrainingMaterialAction(material.id, formData),
                    () => setEditingId(null)
                  )
                }
                className="space-y-3"
              >
                <input
                  name="title"
                  defaultValue={material.title}
                  required
                  className={inputClasses}
                />
                <textarea
                  name="content"
                  defaultValue={material.content}
                  required
                  rows={8}
                  className={`${inputClasses} font-mono`}
                />
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={isPending} className={buttonClasses}>
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm font-medium text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold text-slate-900">{material.title}</h3>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(material.id)}
                      className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (!confirm(`Permanently remove "${material.title}"?`)) return;
                        runAction(() => deleteTrainingMaterialAction(material.id));
                      }}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                  {material.content}
                </p>
              </>
            )}
          </div>
        ))}

        {materials.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
            No training materials yet.
          </p>
        )}
      </div>
    </div>
  );
}
