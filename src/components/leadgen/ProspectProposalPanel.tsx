"use client";

import { useState, useTransition } from "react";
import { prepareProspectProposalAction, sendProspectProposalAction } from "@/app/leadgen/admin/(dashboard)/leads/[id]/proposal-prospect-actions";

export type ProspectProposalView = {
  id: string;
  status: "draft" | "sent";
  title: string;
  to: string;
  subject: string;
  body: string;
  filename: string;
  preparedAt: string;
  sentAt: string | null;
  sections: string[];
};

type Props = { leadId: string; clientName: string; leadEmail: string | null; proposal: ProspectProposalView | null };

// Admin-only. The proposal and its covering email are saved on the lead as a
// DRAFT; nothing is emailed until an Admin ticks the review box and sends it.
export default function ProspectProposalPanel({ leadId, clientName, leadEmail, proposal }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const pdfHref = `/leadgen/admin/leads/${leadId}/proposal-pdf`;
  const draft = proposal?.status === "draft";

  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      setMessage(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: r.message ?? "Done." });
      if (!r.error) {
        setReviewed(false);
        // Pull the saved draft / sent state back from the server.
        window.location.reload();
      }
    });

  return (
    <section aria-label="Prospect proposal" className="mb-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Prospect proposal · {clientName}</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">A personalized proposal and covering email saved on this lead for Admin review. Nothing is emailed until you send it.</p>
        </div>
        {proposal && (
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${draft ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{draft ? "Draft · not sent" : `Sent ${proposal.sentAt ? new Date(proposal.sentAt).toLocaleDateString() : ""}`}</span>
        )}
      </div>

      {!proposal ? (
        <div className="mt-3">
          <p className="text-sm text-slate-700">No proposal has been prepared for this lead yet.</p>
          {!leadEmail && <p className="mt-1 text-[12.5px] text-amber-800">This lead has no email address, so the covering email cannot be prepared yet.</p>}
          <button type="button" disabled={pending || !leadEmail} onClick={() => run(() => prepareProspectProposalAction(leadId))} className="mt-3 min-h-10 rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {pending ? "Preparing…" : "Prepare proposal draft"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm text-slate-800">
          <dl className="grid gap-1 sm:grid-cols-[110px_1fr]">
            <dt className="text-slate-500">To</dt>
            <dd className="font-medium break-all">{proposal.to}</dd>
            <dt className="text-slate-500">Subject</dt>
            <dd className="font-medium">{proposal.subject}</dd>
            <dt className="text-slate-500">Attachment</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-all">{proposal.filename}</span>
              <a href={pdfHref} target="_blank" rel="noreferrer" className="rounded-full border border-sky-300 bg-white px-3 py-1 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50">
                Open PDF
              </a>
              <a href={`${pdfHref}?download=1`} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50">
                Download
              </a>
            </dd>
          </dl>

          <details open className="rounded-lg border border-slate-200 bg-white">
            <summary className="min-h-10 cursor-pointer px-3 py-2 text-[13px] font-semibold text-slate-800">Email draft</summary>
            <pre className="whitespace-pre-wrap border-t border-slate-100 px-3 py-2 font-sans text-[13px] leading-6 text-slate-800" data-testid="proposal-email-body">
              {proposal.body}
            </pre>
          </details>
          <details className="rounded-lg border border-slate-200 bg-white">
            <summary className="min-h-10 cursor-pointer px-3 py-2 text-[13px] font-semibold text-slate-800">Proposal sections</summary>
            <ul className="list-disc border-t border-slate-100 px-7 py-2 text-[13px]">
              {proposal.sections.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>

          {draft && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="flex items-start gap-2 text-[13px] text-amber-950">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-1 h-4 w-4" />
                <span>I reviewed the proposal PDF and the email, and I approve sending them to {proposal.to}.</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || !reviewed}
                  onClick={() => {
                    if (window.confirm(`Send the proposal to ${proposal.to}? This emails the prospect.`)) run(() => sendProspectProposalAction(leadId, proposal.id));
                  }}
                  className="min-h-10 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pending ? "Working…" : `Send to ${proposal.to}`}
                </button>
                <button type="button" disabled={pending} onClick={() => run(() => prepareProspectProposalAction(leadId))} className="min-h-10 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Refresh draft from the lead
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {message && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.kind === "ok" ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
