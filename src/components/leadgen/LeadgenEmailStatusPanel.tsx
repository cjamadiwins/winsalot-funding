import {
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  leadgenEmailStatusAt,
  type LeadgenEmailRow,
} from "@/lib/leadgen-types";

// Lead Generation CRM equivalent of the cleaning CRM's EmailStatusPanel:
// prominent top-of-page status with the full requested milestones, plus
// the latest status badge and latest status-change timestamp.
export default function LeadgenEmailStatusPanel({ latestEmail }: { latestEmail: LeadgenEmailRow | null }) {
  if (!latestEmail) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Email Status</h2>
        <p className="mt-2 text-sm text-slate-500">No email sent to this lead yet.</p>
      </section>
    );
  }

  const milestones: {
    label: "Sent" | "Delivered" | "Delayed" | "Bounced" | "Failed" | "Opened" | "Consultation Link Clicked";
    at: string | null;
    bad?: boolean;
    warning?: boolean;
  }[] = [
    { label: "Sent", at: latestEmail.sent_at },
    { label: "Delivered", at: latestEmail.delivered_at },
    { label: "Delayed", at: latestEmail.delayed_at, warning: true },
    { label: "Bounced", at: latestEmail.bounced_at, bad: true },
    { label: "Failed", at: latestEmail.failed_at, bad: true },
    { label: "Opened", at: latestEmail.opened_at },
    { label: "Consultation Link Clicked", at: latestEmail.clicked_at },
  ];

  const latestAt = leadgenEmailStatusAt(latestEmail);

  return (
    <section className="mt-6 rounded-2xl border-2 border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Email Status</h2>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[latestEmail.status]}`}>
          Latest: {LEADGEN_EMAIL_STATUS_LABELS[latestEmail.status]}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-slate-500">
        Most recent email to {latestEmail.to_email} — &quot;{latestEmail.subject}&quot;
      </p>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {milestones.map((m) => (
          <div
            key={m.label}
            className={`rounded-lg border px-3 py-2.5 text-xs ${
              m.at
                ? m.bad
                  ? "border-rose-200 bg-rose-50"
                  : m.warning
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            <dt className={`font-semibold ${m.at ? "text-slate-700" : "text-slate-400"}`}>{m.label}</dt>
            <dd className="mt-1">{m.at ? new Date(m.at).toLocaleString() : "—"}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-slate-500">
        Latest status change: <span className="font-medium text-slate-700">{LEADGEN_EMAIL_STATUS_LABELS[latestEmail.status]}</span> at {new Date(latestAt).toLocaleString()}
      </p>

      {latestEmail.bounced_at && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          This email bounced — verify or correct this lead&apos;s email address before sending again.
        </p>
      )}

      {latestEmail.failed_at && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          This email failed to send — check the reason in Email History before trying again.
        </p>
      )}
    </section>
  );
}