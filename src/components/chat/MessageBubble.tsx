"use client";

import { formatChatTime } from "@/lib/chat-types";

export default function MessageBubble({
  senderName,
  isAdminSender,
  content,
  createdAt,
  isOwn,
  isDeleted,
  canDelete,
  onDelete,
}: {
  senderName: string;
  isAdminSender?: boolean;
  content: string;
  createdAt: string;
  isOwn: boolean;
  isDeleted: boolean;
  canDelete: boolean;
  onDelete?: () => void;
}) {
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
          <span>{formatChatTime(createdAt)}</span>
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
