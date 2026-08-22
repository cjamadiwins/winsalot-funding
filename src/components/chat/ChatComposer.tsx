"use client";

import { useRef, useState, useTransition } from "react";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/chat-types";

export default function ChatComposer({
  placeholder,
  onSend,
  submitLabel = "Send",
}: {
  placeholder: string;
  onSend: (content: string) => Promise<{ error?: string }>;
  submitLabel?: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Belt-and-suspenders against a double-tapped Send button, on top of
    // the server-side recent-duplicate guard and the disabled state below.
    if (submittingRef.current) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a message.");
      return;
    }
    if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) {
      setError(`Messages can't be longer than ${CHAT_MESSAGE_MAX_LENGTH} characters.`);
      return;
    }
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      const result = await onSend(trimmed);
      submittingRef.current = false;
      if (result.error) {
        setError(result.error);
        return;
      }
      setValue("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[var(--color-border)] bg-[var(--crm-surface)] p-3">
      {error && <p className="mb-2 text-[12px] text-rose-600">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={placeholder}
          rows={1}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-[13.5px] text-slate-900"
        />
        <button
          type="submit"
          disabled={isPending || !value.trim()}
          className="rounded-full bg-[var(--crm-accent,#3e7ef7)] px-5 py-2.5 text-[13.5px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
      <p className="mt-1 text-right text-[10.5px] text-[var(--color-text-muted)]">
        {value.length}/{CHAT_MESSAGE_MAX_LENGTH}
      </p>
    </form>
  );
}
