"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CLIENT_PORTAL_URL,
  CRM_CLIENT_PORTAL_ACTIVITY_LABELS,
  derivePortalStatus,
  PORTAL_STATUS_LABELS,
  PORTAL_STATUS_STYLES,
  type CrmClientPortalActivityRow,
  type PortalLeadgenUserSummary,
} from "@/lib/client-portal-shared";

type ActionResult = { error?: string };
type LeadgenClientOption = { id: string; name: string; slug: string };

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900";
const buttonClass = "rounded-full border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primaryButtonClass = "rounded-full bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function ClientPortalAccessPanel({
  crmClientId,
  leadgenClientId,
  leadgenClientName,
  leadgenClientSlug,
  unlinkedLeadgenClients,
  portalUsers,
  activity,
  linkAction,
  createAndLinkAction,
  createAccessAction,
  activateAction,
  disableAction,
  reactivateAction,
  sendInviteAction,
  resetAccessAction,
}: {
  crmClientId: string;
  leadgenClientId: string | null;
  leadgenClientName: string | null;
  leadgenClientSlug: string | null;
  unlinkedLeadgenClients: LeadgenClientOption[];
  portalUsers: PortalLeadgenUserSummary[];
  activity: CrmClientPortalActivityRow[];
  linkAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
  createAndLinkAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
  createAccessAction: (clientId: string, formData: FormData) => Promise<ActionResult>;
  activateAction: (clientId: string, portalUserId: string) => Promise<ActionResult>;
  disableAction: (clientId: string, portalUserId: string) => Promise<ActionResult>;
  reactivateAction: (clientId: string, portalUserId: string) => Promise<ActionResult>;
  sendInviteAction: (clientId: string, portalUserId: string) => Promise<ActionResult>;
  resetAccessAction: (clientId: string, portalUserId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [showCreateAccess, setShowCreateAccess] = useState(false);

  const portalStatus = portalUsers.some((user) => user.active)
    ? "active"
    : derivePortalStatus(portalUsers[0] ?? null);

  function runAction(action: () => Promise<ActionResult>, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowCreateNew(false);
      setShowCreateAccess(false);
      router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-slate-900">Client Portal Access</h2>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PORTAL_STATUS_STYLES[portalStatus]}`}>
          {PORTAL_STATUS_LABELS[portalStatus]}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Controls the client&apos;s login to the Lead Generation CRM&apos;s Client Portal - separate from this client&apos;s business status above.
      </p>

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

      {!leadgenClientId ? (
        <div className="mt-4 space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
          <p className="text-[13px] text-slate-600">
            Not linked to a Lead Generation CRM client yet. Link this Growth CRM client to the correct Lead Generation client/campaign before creating portal access.
          </p>
          {!showCreateNew ? (
            <form
              action={(formData) => runAction(() => linkAction(crmClientId, formData))}
              className="flex flex-wrap items-center gap-2"
            >
              <select name="leadgen_client_id" required className={`${inputClass} max-w-xs`} defaultValue="">
                <option value="" disabled>
                  Select a Lead Generation client…
                </option>
                {unlinkedLeadgenClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={isPending} className={primaryButtonClass}>
                Link
              </button>
              <button type="button" onClick={() => setShowCreateNew(true)} className={buttonClass}>
                + Create new Lead Gen client
              </button>
            </form>
          ) : (
            <form action={(formData) => runAction(() => createAndLinkAction(crmClientId, formData))} className="flex flex-wrap items-center gap-2">
              <input name="name" required placeholder="Lead Generation client name" className={`${inputClass} max-w-xs`} />
              <button type="submit" disabled={isPending} className={primaryButtonClass}>
                Create &amp; link
              </button>
              <button type="button" onClick={() => setShowCreateNew(false)} className={buttonClass}>
                Cancel
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 text-[13px]">
            <span className="text-slate-500">Linked Lead Generation Client: </span>
            <span className="font-semibold text-slate-900">{leadgenClientName}</span>
          </div>

          <div className="mt-4 space-y-3">
            {portalUsers.map((portalUser, index) => {
              const accountStatus = derivePortalStatus(portalUser);
              return (
                <div key={portalUser.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">Client login {index + 1}: {portalUser.email}</p>
                      <p className="mt-1 text-[12.5px] text-slate-500">{portalUser.full_name} · Last login: {formatDateTime(portalUser.last_login_at)}</p>
                      <p className="text-[12.5px] text-slate-500">Created: {formatDateTime(portalUser.created_at)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PORTAL_STATUS_STYLES[accountStatus]}`}>
                      {PORTAL_STATUS_LABELS[accountStatus]}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {accountStatus === "disabled" && !portalUser.activated_at && (
                      <button type="button" disabled={isPending} onClick={() => runAction(() => activateAction(crmClientId, portalUser.id))} className={primaryButtonClass}>Activate Portal Access</button>
                    )}
                    {accountStatus === "disabled" && portalUser.activated_at && (
                      <button type="button" disabled={isPending} onClick={() => runAction(() => reactivateAction(crmClientId, portalUser.id))} className={primaryButtonClass}>Reactivate Portal Access</button>
                    )}
                    {accountStatus === "active" && (
                      <button type="button" disabled={isPending} onClick={() => runAction(() => disableAction(crmClientId, portalUser.id), `Disable portal access for ${portalUser.email}? Their data and history will be preserved.`)} className="rounded-full border border-rose-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Disable Portal Access</button>
                    )}
                    <button type="button" disabled={isPending} onClick={() => runAction(() => sendInviteAction(crmClientId, portalUser.id))} className={buttonClass}>{portalUser.invited_at ? "Resend Portal Invite" : "Send Portal Invite"}</button>
                    <button type="button" disabled={isPending} onClick={() => runAction(() => resetAccessAction(crmClientId, portalUser.id))} className={buttonClass}>Reset Client Access</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {portalUsers.length < 2 && !showCreateAccess && (
              <button type="button" onClick={() => setShowCreateAccess(true)} className={primaryButtonClass}>
                {portalUsers.length === 0 ? "Create Portal Access" : "Add Second Client Login"}
              </button>
            )}
            {portalUsers.length < 2 && showCreateAccess && (
              <form
                action={(formData) => runAction(() => createAccessAction(crmClientId, formData))}
                className="flex flex-wrap items-center gap-2"
              >
                <input name="email" type="email" required placeholder="Client login email" className={`${inputClass} max-w-xs`} />
                <input name="full_name" placeholder="Contact name (optional)" className={`${inputClass} max-w-xs`} />
                <button type="submit" disabled={isPending} className={primaryButtonClass}>
                  Create
                </button>
                <button type="button" onClick={() => setShowCreateAccess(false)} className={buttonClass}>
                  Cancel
                </button>
              </form>
            )}

            <a href={CLIENT_PORTAL_URL} target="_blank" rel="noopener noreferrer" className={buttonClass}>
              Open Client Portal
            </a>
            {leadgenClientSlug && (
              <a href={`/admin/crm/clients/${crmClientId}/portal-preview`} className={buttonClass}>
                View as Client
              </a>
            )}
          </div>
        </>
      )}

      {activity.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Portal Activity</h3>
          <ul className="mt-2 space-y-1.5">
            {activity.map((entry) => (
              <li key={entry.id} className="text-[12.5px] text-slate-600">
                <span className="font-semibold text-slate-800">{CRM_CLIENT_PORTAL_ACTIVITY_LABELS[entry.action]}</span>
                {entry.detail ? ` — ${entry.detail}` : ""} by {entry.performed_by_name ?? "Unknown"} on {formatDateTime(entry.created_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
