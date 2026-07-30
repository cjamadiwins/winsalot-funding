import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { signOutLeadgenAction } from "./actions";

export default async function LeadgenAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLeadgenAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/leadgen/admin" className="text-sm font-bold text-slate-900">
              Lead Gen CRM
            </Link>
            <Link href="/leadgen/admin" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Dashboard
            </Link>
            <Link href="/leadgen/admin/clients" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Clients
            </Link>
            <Link href="/leadgen/admin/leads" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Leads
            </Link>
            <Link href="/leadgen/admin/appointments" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Appointments
            </Link>
            <Link href="/leadgen/admin/attendance" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Attendance
            </Link>
            <Link href="/leadgen/admin/emails" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Email Tracking
            </Link>
            <Link href="/leadgen/admin/agents" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Agents
            </Link>
            <Link href="/leadgen/admin/templates" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Templates
            </Link>
            <Link href="/leadgen/admin/training" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Training
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
            <form action={signOutLeadgenAction}>
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
