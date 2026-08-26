import { EMAIL_STATUS_LABELS, EMAIL_STATUS_STYLES, EMAIL_TYPE_LABELS, type CrmLeadEmailRow } from "@/lib/crm-types";

export type EmailHistoryEntry = Pick<
  CrmLeadEmailRow,
  "id" | "created_at" | "email_type" | "to_email" | "subject" | "status" | "status_at"
> & { senderName: string | null };

// "Add an Email History section to each prospect page showing all emails
// sent to that prospect" (prospect-email system brief #9) - every tracked
// crm_lead_emails row for this opportunity, newest first. Shared by the
// admin and agent detail pages; each page resolves its own access scope
// (admin: any opportunity, agent: only their currently-assigned ones,
// enforced by the page's own crm_opportunities RLS lookup before this ever
// renders) and passes the already-fetched, already-authorized rows in.
export default function EmailHistoryPanel({ emails }: { emails: EmailHistoryEntry[] }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Email History</h2>
      {emails.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No emails sent to this prospect yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {emails.map((email) => (
            <li key={email.id} className="rounded-lg border border-slate-200 px-3.5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{email.subject}</span>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${EMAIL_STATUS_STYLES[email.status]}`}>
                  {EMAIL_STATUS_LABELS[email.status]}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {EMAIL_TYPE_LABELS[email.email_type]} · to {email.to_email} · sent by {email.senderName || "Unknown"} on{" "}
                {new Date(email.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
