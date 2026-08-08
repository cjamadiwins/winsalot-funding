"use client";

import { useState, useTransition } from "react";
import type { ProviderNoteRow } from "@/lib/provider-types";

// Internal Notes (brief "NOTES") - never shown to providers (there is no
// provider-facing login to this data anywhere in the app). An agent may
// only ever edit their own note, enforced both here (no Edit button shown
// for someone else's note) and at the database level (RLS:
// provider_notes_agent_update_own_note). The author's name is stored
// directly on the note at write time (author_name) rather than joined
// from crm_users, since an agent's session can only ever select their own
// crm_users row (crm_users_select_self).
export default function ProviderNotesCard({
  notes,
  currentUserId,
  isAdmin,
  onAdd,
  onUpdate,
}: {
  notes: ProviderNoteRow[];
  currentUserId: string;
  isAdmin: boolean;
  onAdd: (formData: FormData) => Promise<{ error?: string } | void>;
  onUpdate: (noteId: string, formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  return (
    <section id="notes" className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Internal Notes</h2>
      <p className="mt-1 text-[12px] text-slate-500">Visible to agents and administrators only.</p>

      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}

      <form
        action={(formData) => {
          runAction(() => onAdd(formData));
        }}
        className="mt-3 space-y-2"
      >
        <textarea
          name="note"
          required
          placeholder="Add an internal note…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] min-h-[70px]"
        />
        <button type="submit" disabled={isPending} className="rounded-full bg-slate-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-slate-600">
          Add Note
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">No internal notes yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => {
            const canEdit = isAdmin || note.user_id === currentUserId;
            return (
              <li key={note.id} className="rounded-lg border border-slate-200 px-3.5 py-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{note.author_name}</span>
                  <span className="text-[12px] text-slate-500">{new Date(note.created_at).toLocaleString()}</span>
                </div>
                {editingId === note.id ? (
                  <form
                    action={(formData) => {
                      runAction(() => onUpdate(note.id, formData));
                      setEditingId(null);
                    }}
                    className="mt-2 space-y-2"
                  >
                    <textarea
                      name="note"
                      required
                      defaultValue={note.note}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] min-h-[60px]"
                    />
                    <div className="flex gap-3">
                      <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-sky-700">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-[12px] font-semibold text-slate-500">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{note.note}</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditingId(note.id)}
                        className="mt-1 text-[12px] font-semibold text-sky-600"
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
