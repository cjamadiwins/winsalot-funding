import type { ReactNode } from "react";
import Link from "next/link";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import type { CrmNotificationRow } from "@/lib/crm-notifications";
import {
  agentSignOutAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "./actions";

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const crmUser = await requireCrmUser();

  const supabase = await createSupabaseServerClient();
  const { data: notifications } = await supabase
    .from("crm_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-5">
            <Link href="/agent/dashboard" className="flex flex-col leading-tight">
              <span className="font-heading text-[17px] font-bold text-[var(--color-ink-strong)]">
                Winsalot Corp. Cleaning CRM
              </span>
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                Empowering Businesses. One Solution at a Time.
              </span>
            </Link>
            <Link
              href="/agent/opportunities"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Cleaning Opportunities
            </Link>
            <Link
              href="/agent/provider-acquisition"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Provider Acquisition
            </Link>
            <Link
              href="/agent/providers"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Providers
            </Link>
            <Link
              href="/agent/emails"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Email Tracking
            </Link>
            <Link
              href="/agent/training"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Sales Training &amp; Call Scripts
            </Link>
            <Link
              href="/agent/attendance"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Attendance
            </Link>
            <Link
              href="/agent/performance"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Performance
            </Link>
            <Link
              href="/agent/performance/monthly"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Monthly Performance
            </Link>
            <Link
              href="/agent/pay"
              className="text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              My Pay
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell
              notifications={(notifications ?? []) as CrmNotificationRow[]}
              markReadAction={markNotificationReadAction}
              markAllReadAction={markAllNotificationsReadAction}
            />
            <span className="hidden text-sm text-[var(--color-text-muted)] sm:inline">
              {crmUser.full_name || crmUser.email}
            </span>
            <form action={agentSignOutAction}>
              <button
                type="submit"
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
