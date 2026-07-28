import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { signOutLeadgenAgentAction } from "./actions";

export default async function LeadgenAgentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLeadgenAgent();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/leadgen/agent" className="text-sm font-bold text-slate-900">
              Lead Gen CRM
            </Link>
            <Link href="/leadgen/agent" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Dashboard
            </Link>
            <Link href="/leadgen/agent/leads" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              My Leads
            </Link>
            <Link href="/leadgen/agent/appointments" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              My Appointments
            </Link>
            <Link href="/leadgen/agent/training" className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Training
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.full_name}</span>
            <form action={signOutLeadgenAgentAction}>
              <button type="submit" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
