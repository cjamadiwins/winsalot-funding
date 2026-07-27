"use client";

import { useState } from "react";
import Modal from "./Modal";

// Provider Profile's "Send SMS" quick action - texts the provider's own
// phone. Distinct from the pre-existing internal admin SMS notifications.
export default function SendProviderSmsModal({
  providerPhone,
  isPending,
  sendAction,
  onClose,
  onSent,
}: {
  providerPhone: string;
  isPending: boolean;
  sendAction: (formData: FormData) => Promise<{ error?: string }>;
  onClose: () => void;
  onSent: () => void;
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
    onSent();
    onClose();
  }

  return (
    <Modal title="Send SMS" onClose={onClose}>
      <form action={handleSubmit} className="space-y-3 text-sm">
        <p className="text-xs text-slate-500">To: {providerPhone}</p>
        <textarea
          name="message"
          required
          maxLength={480}
          placeholder="Message"
          className="w-full min-h-[100px] resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px]"
        />
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || isPending}
            className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send SMS"}
          </button>
          <button type="button" onClick={onClose} disabled={submitting} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
