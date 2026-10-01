import Link from "next/link";
import { PORTAL_STATUS_LABELS, PORTAL_STATUS_STYLES, derivePortalStatus } from "@/lib/client-portal-shared";

function formatDateTime(value: string | null): string {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Compact Admin-only "Client Portal" strip for a Client Management profile.
// Shows identity + status only - the password is never stored in or read from
// anywhere this renders, and the actions are Admin-session previews (audited),
// never a login as the client.
export default function ClientPortalAdminPanel({
  clientId,
  clientName,
  logins,
  lastBriefViewedAt,
  previewHref,
}: {
  clientId: string;
  clientName: string;
  logins: { email: string; active: boolean; last_login_at: string | null }[];
  lastBriefViewedAt: string | null;
  previewHref: string;
}) {
  const status = logins.some((l) => l.active) ? "active" : derivePortalStatus(logins[0] ?? null);
  const lastActivity = [...logins.map((l) => l.last_login_at), lastBriefViewedAt].filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
  const emails = logins.map((l) => l.email).join(", ");
  const linkClass = "rounded-full border border-slate-300 px-3 py-1 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50";

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client Portal</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-700">
            <span className="font-semibold text-slate-900">{clientName}</span>
            <span className="break-all">{emails || "No portal login"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PORTAL_STATUS_STYLES[status]}`}>{PORTAL_STATUS_LABELS[status]}</span>
            <span className="text-slate-500">Last activity: {formatDateTime(lastActivity)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/leadgen/admin/clients/${clientId}/portal-preview`} className={linkClass}>
            View Client Portal
          </Link>
          <Link href={previewHref} className={linkClass}>
            Preview as Client
          </Link>
          <Link href={`/leadgen/admin/appointments?client=${clientId}`} className={linkClass}>
            Open Client Appointments
          </Link>
        </div>
      </div>
    </section>
  );
}
