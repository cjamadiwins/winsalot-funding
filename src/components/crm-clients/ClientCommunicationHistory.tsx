"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { communicationStatusLabel, type ClientCommunicationEntry } from "@/lib/crm-client-communications-shared";

type ActionResult = { error?: string; warning?: string };
type Content = { subject: string; recipient: string; sender: string; sentAt: string; status: string | null; html: string | null; text: string | null; note: string | null };

const STATUS_STYLES: Record<string, string> = {
  delivered: "bg-emerald-100 text-emerald-800",
  opened: "bg-emerald-100 text-emerald-800",
  clicked: "bg-emerald-100 text-emerald-800",
  sent: "bg-sky-100 text-sky-800",
  delayed: "bg-amber-100 text-amber-800",
  bounced: "bg-rose-100 text-rose-800",
  complained: "bg-rose-100 text-rose-800",
  failed: "bg-rose-100 text-rose-800",
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString("en-US", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" }) + " ET";
}

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const VISIBLE_DEFAULT = 8;

export default function ClientCommunicationHistory({
  clientId,
  clientEmail,
  entries,
  setupDraft,
  hasSetupEmail,
  sendUpdateAction,
  resendAction,
  getContentAction,
}: {
  clientId: string;
  clientEmail: string | null;
  entries: ClientCommunicationEntry[];
  setupDraft: { subject: string; message: string };
  hasSetupEmail: boolean;
  sendUpdateAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
  resendAction: (clientId: string, communicationId: string, confirmed: boolean) => Promise<ActionResult>;
  getContentAction: (clientId: string, source: string, id: string) => Promise<{ content?: Content; error?: string }>;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [viewing, setViewing] = useState<{ entry: ClientCommunicationEntry; content: Content | null; error: string | null } | null>(null);
  const [composing, setComposing] = useState(false);
  const [template, setTemplate] = useState<"update" | "campaign_setup">("update");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toEmail, setToEmail] = useState(clientEmail ?? "");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = showAll ? entries : entries.slice(0, VISIBLE_DEFAULT);

  function openCompose() {
    setComposing(true);
    setComposeError(null);
    setTemplate("update");
    setSubject("");
    setBody("");
    setToEmail(clientEmail ?? "");
    setAllowDuplicate(false);
  }

  function chooseTemplate(next: "update" | "campaign_setup") {
    setTemplate(next);
    if (next === "campaign_setup") {
      setSubject(setupDraft.subject);
      setBody(setupDraft.message);
    } else {
      setSubject("");
      setBody("");
    }
  }

  function send() {
    setComposeError(null);
    if (!window.confirm(`Send this email to ${toEmail}?\n\nSubject: ${subject}\n\nThe final version will be saved to this client's Communication History.`)) return;
    const formData = new FormData();
    formData.set("to_email", toEmail);
    formData.set("subject", subject);
    formData.set("message", body);
    formData.set("template", template);
    if (allowDuplicate) formData.set("allow_duplicate", "yes");
    startTransition(async () => {
      const result = await sendUpdateAction(clientId, formData);
      if (result.error) {
        setComposeError(result.error);
        return;
      }
      setComposing(false);
      setMessage({ kind: result.warning ? "error" : "ok", text: result.warning ?? `Email sent to ${toEmail} and saved to Communication History.` });
      router.refresh();
    });
  }

  function view(entry: ClientCommunicationEntry) {
    setViewing({ entry, content: null, error: null });
    startTransition(async () => {
      const result = await getContentAction(clientId, entry.source, entry.id);
      setViewing({ entry, content: result.content ?? null, error: result.error ?? null });
    });
  }

  function resend(entry: ClientCommunicationEntry) {
    if (!window.confirm(`Send this email again?\n\n"${entry.subject}"\nto ${entry.recipient}\n\nThe client will receive another copy, and the re-send is logged as a new entry.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resendAction(clientId, entry.id, true);
      if (result.error) setMessage({ kind: "error", text: result.error });
      else {
        setMessage({ kind: result.warning ? "error" : "ok", text: result.warning ?? `Email re-sent to ${entry.recipient}.` });
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Communication History</h2>
          <p className="text-[12.5px] text-slate-500">Important emails sent to this client, most recent first.</p>
        </div>
        <button type="button" onClick={openCompose} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
          Send Client Update
        </button>
      </div>

      {message && <p className={`mt-3 rounded-lg border px-3 py-2 text-[13px] ${message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{message.text}</p>}

      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-3 py-3">Sent</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Recipient</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Related</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-text-muted)]">
                  No client emails recorded yet.
                </td>
              </tr>
            )}
            {visible.map((entry) => (
              <tr key={entry.key}>
                <td className="whitespace-nowrap px-3 py-3 align-top text-[12.5px]">{formatWhen(entry.sentAt)}</td>
                <td className="px-3 py-3 align-top">
                  <div className="font-medium text-slate-900">{entry.subject}</div>
                  <div className="text-[12px] text-slate-500">
                    {entry.category} · from {entry.sender}
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-[12.5px]">{entry.recipient}</td>
                <td className="px-3 py-3 align-top">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entry.status ? (STATUS_STYLES[entry.status] ?? "bg-slate-100 text-slate-700") : "bg-slate-100 text-slate-600"}`}>
                    {communicationStatusLabel(entry.status)}
                  </span>
                </td>
                <td className="px-3 py-3 align-top text-[12.5px]">
                  {entry.related ? (
                    entry.related.href ? (
                      <Link href={entry.related.href} className="font-medium text-sky-700 hover:underline">
                        {entry.related.label}
                      </Link>
                    ) : (
                      entry.related.label
                    )
                  ) : (
                    "-"
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-[12.5px]">
                  {entry.hasContent ? (
                    <button type="button" onClick={() => view(entry)} className="font-medium text-sky-700 hover:underline">
                      View Email
                    </button>
                  ) : (
                    <span className="text-slate-400" title="The content of this email wasn't stored.">
                      No content
                    </span>
                  )}
                  {entry.canResend && (
                    <>
                      {" · "}
                      <button type="button" disabled={isPending} onClick={() => resend(entry)} className="font-medium text-sky-700 hover:underline disabled:opacity-50">
                        Resend
                      </button>
                    </>
                  )}
                  {!entry.canResend && entry.resendNote && <div className="max-w-[220px] whitespace-normal text-[11px] text-slate-400">{entry.resendNote}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > VISIBLE_DEFAULT && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-[12.5px] font-medium text-sky-700 hover:underline">
          {showAll ? "Show fewer" : `Show all ${entries.length} emails`}
        </button>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{viewing.entry.subject}</h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px] text-slate-600">
              <dt className="font-medium">To</dt>
              <dd>{viewing.entry.recipient}</dd>
              <dt className="font-medium">From</dt>
              <dd>{viewing.content?.sender ?? viewing.entry.sender}</dd>
              <dt className="font-medium">Sent</dt>
              <dd>{formatWhen(viewing.entry.sentAt)}</dd>
              <dt className="font-medium">Status</dt>
              <dd>{communicationStatusLabel(viewing.entry.status)}</dd>
            </dl>
            <div className="mt-3 min-h-[120px] flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
              {!viewing.content && !viewing.error && <p className="p-4 text-sm text-slate-500">Loading…</p>}
              {viewing.error && <p className="p-4 text-sm text-rose-700">{viewing.error}</p>}
              {viewing.content?.note && <p className="p-4 text-sm text-slate-600">{viewing.content.note}</p>}
              {viewing.content?.html ? (
                <iframe title="Email content" sandbox="" srcDoc={viewing.content.html} className="h-[420px] w-full bg-white" />
              ) : viewing.content?.text ? (
                <pre className="whitespace-pre-wrap p-4 text-[13px] text-slate-800">{viewing.content.text}</pre>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setViewing(null)} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Send Client Update</h3>
            <p className="mt-1 text-[12.5px] text-slate-500">Sent from Winsalot Corp. and saved to this client&apos;s Communication History automatically.</p>
            {composeError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{composeError}</p>}
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">Template</span>
                <select value={template} onChange={(e) => chooseTemplate(e.target.value as "update" | "campaign_setup")} className={inputClass}>
                  <option value="update">Custom update</option>
                  <option value="campaign_setup">Campaign setup complete</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">To *</span>
                <input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">Subject *</span>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-slate-600">Message *</span>
                <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
              </label>
              {template === "campaign_setup" && (
                <p className="text-[12px] text-slate-500">This is a draft built from the client&apos;s record. Review and edit it - the version you send is the version that&apos;s logged.</p>
              )}
              {template === "campaign_setup" && hasSetupEmail && (
                <label className="flex items-center gap-2 text-[12.5px] text-amber-800">
                  <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} />A setup email was already sent - send again anyway
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setComposing(false)} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !toEmail.trim() || !subject.trim() || !body.trim()}
                onClick={send}
                className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {isPending ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
