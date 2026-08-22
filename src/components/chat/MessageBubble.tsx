"use client";

import { useState } from "react";
import { CHAT_MESSAGE_MAX_LENGTH, formatChatTime } from "@/lib/chat-types";

export default function MessageBubble({
  senderName,
  isAdminSender,
  content,
  createdAt,
  editedAt,
  isOwn,
  isDeleted,
  canDelete,
  onDelete,
  canEdit,
  onEdit,
}: {
  senderName: string;
  isAdminSender?: boolean;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  isOwn: boolean;
  isDeleted: boolean;
  canDelete: boolean;
  onDelete?: () => void;
  canEdit?: boolean;
  onEdit?: (newContent: string) => Promise<{ error?: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(content);
    setError(null);
    setIsEditing(true);
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Message can't be empty.");
      return;
    }
    if (!onEdit) return;
    setSaving(true);
    const result = await onEdit(trimmed);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
        <div className="w-full max-w-[80%] rounded-2xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-3">
          <div className="mb-1 text-[11.5px] font-semibold text-[var(--color-ink-strong)]">{senderName}</div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            rows={2}
            autoFocus
            className="w-full resize-none rounded-lg border border-slate-300 px-2.5 py-2 text-[13.5px] text-slate-900"
          />
          {error && <p className="mt-1 text-[11.5px] text-rose-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-3 text-[12px] font-semibold">
            <button type="button" onClick={() => setIsEditing(false)} disabled={saving} className="text-[var(--color-text-muted)] hover:underline">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="text-[var(--crm-accent,#3e7ef7)] hover:underline disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13.5px] ${
        isOwn
          ? "bg-[var(--crm-accent,#3e7ef7)] text-white"
          : "border border-[var(--color-border)] bg-[var(--crm-surface)] text-[var(--color-ink)]"
      }`}
      >
        <div className={`mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold ${isOwn ? "text-white/85" : "text-[var(--color-ink-strong)]"}`}>
          <span>{senderName}</span>
          {isAdminSender && (
            <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${
              isOwn ? "bg-white/20 text-white" : "bg-sky-100 text-sky-800"
            }`}
            >
              Admin
            </span>
          )}
        </div>

        {isDeleted ? (
          <p className={`italic ${isOwn ? "text-white/70" : "text-[var(--color-text-muted)]"}`}>Message removed</p>
        ) : (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        )}

        <div className={`mt-1 flex items-center justify-end gap-2 text-[10.5px] ${isOwn ? "text-white/70" : "text-[var(--color-text-muted)]"}`}>
          {editedAt && !isDeleted && <span className="italic">Edited</span>}
          <span>{formatChatTime(createdAt)}</span>
          {canEdit && !isDeleted && (
            <button
              type="button"
              onClick={startEdit}
              className={`opacity-0 transition group-hover:opacity-100 ${isOwn ? "hover:text-white" : "hover:text-sky-600"}`}
            >
              Edit
            </button>
          )}
          {canDelete && !isDeleted && (
            <button
              type="button"
              onClick={onDelete}
              className={`opacity-0 transition group-hover:opacity-100 ${isOwn ? "hover:text-white" : "hover:text-rose-600"}`}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
