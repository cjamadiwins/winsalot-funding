import type { ReactNode } from "react";
import Link from "next/link";
import { requireCrmUser } from "@/lib/crm-auth";
import { agentSignOutAction } from "./actions";

export default async function AgentLayout({ children }: { children: ReactNode }) {
  const crmUser = await requireCrmUser();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/agent/dashboard"
            className="font-heading text-[17px] font-bold text-[var(--color-ink-strong)]"
          >
            Winsalot CRM
          </Link>
          <div className="flex items-center gap-3">
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
