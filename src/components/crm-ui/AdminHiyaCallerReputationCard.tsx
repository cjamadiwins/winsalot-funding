import { ExternalLink, ShieldCheck } from "lucide-react";

const HIYA_CONNECT_URL = "https://connect.hiya.com/login";

// Rendered only from the Growth and Lead Generation Admin dashboards,
// whose server pages already call requireCrmAdmin() / requireLeadgenAdmin().
export default function AdminHiyaCallerReputationCard() {
  return (
    <section className="mt-3 rounded-2xl border border-sky-200 bg-[var(--crm-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-sky-50 p-2 text-sky-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">Hiya Caller Reputation</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Check Winsalot Corp phone-number reputation, spam-label status, registration status, and register new business numbers when needed.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <a
            href={HIYA_CONNECT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[11px] bg-[var(--crm-accent,#3e7ef7)] px-4 py-2.5 text-[length:var(--crm-shared-body,13px)] font-bold text-white shadow-sm transition hover:bg-[var(--crm-accent-hover,#2e63d6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            Open Hiya Connect
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <p className="text-[length:var(--crm-shared-note,11px)] leading-4 text-slate-500">
            Review periodically and whenever a Dialpad number is added, replaced, or changed.
          </p>
        </div>
      </div>
    </section>
  );
}
