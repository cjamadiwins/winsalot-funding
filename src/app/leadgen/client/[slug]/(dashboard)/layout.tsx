import Link from "next/link";
import { requireLeadgenClient } from "@/lib/leadgen-auth";
import { signOutLeadgenClientAction } from "./actions";

export default async function LeadgenClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { client } = await requireLeadgenClient(slug);

  return (
    <div className="crm-theme min-h-screen bg-slate-50">
      <header className="border-b border-[var(--crm-border)] bg-[var(--crm-sidebar)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-sm font-bold text-slate-900">{client.name}</span>
            <Link href={`/leadgen/client/${slug}`} className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Dashboard
            </Link>
            <Link href={`/leadgen/client/${slug}/appointments`} className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Appointments
            </Link>
            <Link href={`/leadgen/client/${slug}/communications`} className="text-sm font-medium text-slate-600 hover:text-sky-600">
              Communications
            </Link>
          </nav>
          <form action={signOutLeadgenClientAction}>
            <button type="submit" className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
