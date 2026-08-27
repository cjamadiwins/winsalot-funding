"use client";

import { useState } from "react";
import { sendCrmTestEmailAction } from "./actions";

export default function TestEmailForm({ types }: { types: readonly { id: string; label: string }[] }) {
  const [type, setType] = useState(types[0]?.id ?? "");
  const [toEmail, setToEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);

    const result = await sendCrmTestEmailAction(type, toEmail);
    setSubmitting(false);

    if (result.error) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setMessage({ kind: "success", text: `Test email sent to ${toEmail}. Subject is prefixed with "[TEST]".` });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Email Type</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900">
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-slate-600">Send To</span>
        <input
          type="email"
          required
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          placeholder="you@winsalotcorp.com"
          className="w-64 rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900"
        />
      </label>
      <button
        type="submit"
        disabled={submitting || !toEmail}
        className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send Test Email"}
      </button>
      {message && (
        <p className={`w-full text-[13px] font-medium ${message.kind === "success" ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p>
      )}
    </form>
  );
}
