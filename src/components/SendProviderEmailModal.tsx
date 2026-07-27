"use client";

import { useState } from "react";
import Modal from "./Modal";

// Provider Profile's generic "Send Email" quick action.
export default function SendProviderEmailModal({
  providerEmail,
  isPending,
  sendAction,
  onClose,
  onSent,
}: {
  providerEmail: string | null;
  isPending: boolean;
  sendAction: (formData: FormData) => Promise<{ error?: string; email?: string }>;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await sendAction(formData);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSent(result.email ?? providerEmail ?? "");
    onClose();
  }

  return (
    <Modal title="Send Email" onClose={onClose}>
      <form action={handleSubmit} className="space-y-3 text-sm">
        <p className="text-xs text-slate-500">To: {providerEmail || "No email address on file"}</p>
        <input
          name="subject"
          required
          placeholder="Subject"
          className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px]"
        />
        <textarea
          name="message"
          required
          placeholder="Message"
          className="w-full min-h-[140px] resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px]"
        />
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || isPending || !providerEmail}
            className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send Email"}
          </button>
          <button type="button" onClick={onClose} disabled={submitting} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
