"use client";

import { useState, useTransition } from "react";
import { EMAIL_STATUS_LABELS, EMAIL_STATUS_STYLES } from "@/lib/crm-types";
import type { ProviderEmailHistoryRow } from "@/lib/provider-types";

// Email History (brief "EMAIL HISTORY") - every email sent to this
// provider, not just the most recent one (ProviderEmailStatusPanel).
// "Resend" is only offered for the templated intake-form email, since
// that's the only one with a reusable, stored template - the free-form
// "Send Email" quick action's exact message is never stored verbatim.
export default function ProviderEmailHistoryCard({
  emails,
  isAdmin,
  onResendIntake,
}: {
  emails: ProviderEmailHistoryRow[];
  isAdmin: boolean;
  onResendIntake?: () => Promise<{ error?: string } | void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleResend() {
    if (!onResendIntake) return;
    setError(null);
    startTransition(async () => {
      const result = await onResendIntake();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  return (
    <section id="email-history" className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Email History</h2>
      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}

      {emails.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-500">No emails sent to this provider yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {emails.map((email) => (
            <li key={email.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 text-[13px]">
              <div>
                <div className="font-semibold text-slate-900">{email.subject}</div>
                <div className="text-[12px] text-slate-500">
                  {new Date(email.created_at).toLocaleString()} · to {email.to_email}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${EMAIL_STATUS_STYLES[email.status]}`}>
                  {EMAIL_STATUS_LABELS[email.status]}
                </span>
                {isAdmin && email.email_type === "provider_intake" && onResendIntake && (
                  <button type="button" disabled={isPending} onClick={handleResend} className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
                    Resend
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
