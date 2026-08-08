import { EMAIL_STATUS_LABELS, EMAIL_STATUS_STYLES } from "@/lib/crm-types";
import type { LatestProviderLeadEmail } from "@/lib/provider-types";

// Provider Acquisition's equivalent of EmailStatusPanel
// (src/components/EmailStatusPanel.tsx) - same Sent/Delivered/Bounced/
// Failed milestone display, kept as its own component rather than
// widening the lead one, since it reads a LatestProviderLeadEmail (backed
// by crm_lead_emails.provider_lead_id, see migration 0026) instead of a
// LatestCrmLeadEmail. "Delivered" is never inferred from any other event -
// only an actual email.delivered webhook sets it (see
// src/app/api/webhooks/resend/route.ts).
export default function ProviderEmailStatusPanel({
  latestEmail,
}: {
  latestEmail: LatestProviderLeadEmail | null;
}) {
  if (!latestEmail) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Intake Email Status
        </h2>
        <p className="mt-2 text-sm text-slate-500">No intake form email sent to this provider yet.</p>
      </section>
    );
  }

  const milestones: { label: "Sent" | "Delivered" | "Bounced" | "Failed"; at: string | null; bad?: boolean }[] = [
    { label: "Sent", at: latestEmail.sent_at },
    { label: "Delivered", at: latestEmail.delivered_at },
    { label: "Bounced", at: latestEmail.bounced_at, bad: true },
    { label: "Failed", at: latestEmail.failed_at, bad: true },
  ];

  return (
    <section className="mt-6 rounded-2xl border-2 border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Intake Email Status
        </h2>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${EMAIL_STATUS_STYLES[latestEmail.status]}`}
        >
          Latest: {EMAIL_STATUS_LABELS[latestEmail.status]}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Provider intake form email to {latestEmail.to_email} — &quot;{latestEmail.subject}&quot;
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {milestones.map((m) => (
          <div
            key={m.label}
            className={`rounded-lg border px-3 py-2.5 text-xs ${
              m.at
                ? m.bad
                  ? "border-rose-200 bg-rose-50"
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
        Latest status change:{" "}
        <span className="font-medium text-slate-700">{EMAIL_STATUS_LABELS[latestEmail.status]}</span> at{" "}
        {new Date(latestEmail.status_at).toLocaleString()}
      </p>

      {latestEmail.bounced_at && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          This email bounced — verify or correct this provider&apos;s email address before sending
          again.
        </p>
      )}
      {latestEmail.failed_at && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          This email failed to send — check the reason in the activity log below before trying
          again.
        </p>
      )}
      {latestEmail.status === "complained" && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          This recipient marked an email as spam — consider not emailing this provider again.
        </p>
      )}
    </section>
  );
}
