"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { error?: string; sentTo?: string };

// Admin-only: View is the page itself; Download PDF, Email Receipt and
// Resend Receipt live here.
export default function ReceiptAdminActions({
  paymentId,
  defaultEmail,
  emailCount,
  lastEmailedAt,
  lastEmailedTo,
  disabled,
  emailAction,
}: {
  paymentId: string;
  defaultEmail: string;
  emailCount: number;
  lastEmailedAt: string | null;
  lastEmailedTo: string | null;
  disabled: boolean;
  emailAction: (paymentId: string, to: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [to, setTo] = useState(defaultEmail);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const isResend = emailCount > 0;

  function send() {
    if (isResend && !window.confirm(`This receipt was already emailed${lastEmailedTo ? ` to ${lastEmailedTo}` : ""}. Send it again to ${to}?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await emailAction(paymentId, to);
      if (result.error) setMessage({ kind: "error", text: result.error });
      else {
        setMessage({ kind: "ok", text: `Receipt emailed to ${result.sentTo}.` });
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto mb-4 max-w-2xl rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[12px] font-medium text-slate-600">Send receipt to</span>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-[13.5px]" />
        </label>
        <button type="button" onClick={send} disabled={isPending || disabled || !to.trim()} className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {isPending ? "Sending…" : isResend ? "Resend Receipt" : "Email Receipt"}
        </button>
        <a href={`/admin/crm/payments/${paymentId}/receipt/pdf`} className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Download Receipt PDF
        </a>
      </div>
      {isResend && lastEmailedAt && (
        <p className="mt-2 text-[12px] text-slate-500">
          Last emailed {new Date(lastEmailedAt).toLocaleString()} to {lastEmailedTo} ({emailCount} send{emailCount === 1 ? "" : "s"}).
        </p>
      )}
      {message && <p className={`mt-2 text-[12.5px] ${message.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
    </div>
  );
}
