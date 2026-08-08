"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CrmNotificationRow } from "@/lib/crm-notifications";
import { notificationTimeAgoLabel } from "@/lib/crm-notifications";

// Shared by both /admin and /agent layouts - the "notify the assigned
// agent and administrator inside the CRM" requirement, showing the same
// bell + dropdown in either dashboard's header. Each recipient only ever
// sees their own crm_notifications rows (RLS: user_id = auth.uid()), so
// this component doesn't need to know which role it's rendered for -
// link_path is already correct per-row (set at insert time in
// src/lib/provider-intake-submission.ts).
export default function NotificationBell({
  notifications,
  markReadAction,
  markAllReadAction,
}: {
  notifications: CrmNotificationRow[];
  markReadAction: (id: string) => Promise<void>;
  markAllReadAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-slate-300 p-2 text-slate-600 transition hover:border-slate-400"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-[var(--crm-surface)] shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => markAllReadAction())}
                  className="text-xs font-medium text-sky-600 hover:text-sky-700 disabled:opacity-60"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.link_path ?? "#"}
                    onClick={() => {
                      setOpen(false);
                      if (!n.is_read) startTransition(() => markReadAction(n.id));
                    }}
                    className={`block border-b border-slate-50 px-4 py-3 text-sm transition hover:bg-slate-50 ${
                      n.is_read ? "" : "bg-sky-50/60"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && (
                        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-sky-600" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{n.title}</p>
                        {n.body && <p className="mt-0.5 text-slate-600">{n.body}</p>}
                        <p className="mt-1 text-xs text-slate-400">
                          {notificationTimeAgoLabel(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
