import Link from "next/link";
import { requireAdminUser } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import NotificationBell from "@/components/NotificationBell";
import type { CrmNotificationRow } from "@/lib/crm-notifications";
import { signOutAction, markNotificationReadAction, markAllNotificationsReadAction } from "./actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminUser();

  // Best-effort: this admin may not have a crm_users row (e.g. an /admin
  // account that predates the CRM) - requireCrmAdmin() inside the
  // notification actions handles that gate; here we just render an empty
  // bell rather than blocking the whole dashboard on it.
  const supabase = await createSupabaseServerClient();
  const { data: notifications } = await supabase
    .from("crm_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="crm-theme min-h-screen bg-slate-50">
      <header className="border-b border-[var(--crm-border)] bg-[var(--crm-sidebar)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/admin" className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-slate-900">Winsalot Corp. Cleaning CRM</span>
              <span className="text-xs font-medium text-slate-500">Empowering Businesses. One Solution at a Time.</span>
            </Link>
            <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Requests
            </Link>
            <Link
              href="/admin/providers"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Providers
            </Link>
            <Link
              href="/admin/invoices"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Invoices
            </Link>
            <Link
              href="/admin/crm"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              CRM
            </Link>
            <Link
              href="/admin/crm/leads"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Quote Fulfillment
            </Link>
            <Link
              href="/admin/crm/agents"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Agents
            </Link>
            <Link
              href="/admin/crm/payroll"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Payroll
            </Link>
            <Link
              href="/admin/crm/performance"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Performance
            </Link>
            <Link
              href="/admin/crm/attendance"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Attendance
            </Link>
            <Link
              href="/admin/crm/opportunities"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Cleaning Opportunities
            </Link>
            <Link
              href="/admin/crm/provider-acquisition"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Provider Acquisition
            </Link>
            <Link
              href="/admin/crm/training"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Training
            </Link>
            <Link
              href="/admin/crm/emails"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Email Tracking
            </Link>
            <Link
              href="/admin/crm/attendance"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Attendance
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <NotificationBell
              notifications={(notifications ?? []) as CrmNotificationRow[]}
              markReadAction={markNotificationReadAction}
              markAllReadAction={markAllNotificationsReadAction}
            />
            <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
