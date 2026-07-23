import Link from "next/link";
import { requireAdminUser } from "@/lib/admin-auth";
import { signOutAction } from "./actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <nav className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-bold text-slate-900">
              Quote Dashboard
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
              href="/admin/crm"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              CRM
            </Link>
            <Link
              href="/admin/crm/agents"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Agents
            </Link>
            <Link
              href="/admin/crm/opportunities"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Cleaning Opportunities
            </Link>
            <Link
              href="/admin/crm/training"
              className="text-sm font-medium text-slate-600 hover:text-sky-600"
            >
              Training
            </Link>
          </nav>

          <div className="flex items-center gap-4">
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
