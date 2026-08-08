"use client";

import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

// `icon` takes an already-rendered element (e.g. `<Users />`), not a
// component reference - every layout using CrmShell is a Server
// Component, and a bare component reference (a function) can't cross
// the server/client boundary as a prop, only a rendered element can.
export type CrmNavItem = { label: string; href: string; icon: ReactNode };

function isNavItemActive(pathname: string, homeHref: string, href: string) {
  if (href === homeHref) return pathname === homeHref;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Top-level (not nested inside CrmShell's render) so its identity is
// stable across re-renders instead of being recreated every time.
function SidebarNav({
  navItems,
  pathname,
  homeHref,
  onNavigate,
}: {
  navItems: CrmNavItem[];
  pathname: string;
  homeHref: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {navItems.map((item) => {
        const active = isNavItemActive(pathname, homeHref, item.href);
        const iconEl = isValidElement(item.icon)
          ? cloneElement(item.icon as ReactElement<{ className?: string; strokeWidth?: number }>, {
              className: "h-[18px] w-[18px] shrink-0",
              strokeWidth: 2,
            })
          : item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition ${
              active
                ? "bg-[var(--crm-accent,#3e7ef7)] text-white shadow-sm"
                : "text-[var(--crm-text-soft,#c3d0e3)] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {iconEl}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SignOutButton({ signOutAction }: { signOutAction: () => void | Promise<void> }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[var(--crm-text-soft,#c3d0e3)] transition hover:bg-white/[0.06] hover:text-white"
      >
        <LogOut className="h-4 w-4" strokeWidth={2} />
        Sign out
      </button>
    </form>
  );
}

// Left sidebar app shell shared by all five logged-in CRM areas (Cleaning
// admin/agent, Lead Gen admin/agent, Lead Gen client). Desktop shows a
// fixed sidebar; below the `lg` breakpoint it collapses to a top bar with
// an off-canvas menu so nothing becomes unusable on tablet/mobile. Purely
// presentational chrome - every layout keeps its own data fetching
// (auth, notifications) and passes the same links/actions it already had
// in as props here.
export default function CrmShell({
  brandTitle,
  brandSubtitle,
  homeHref,
  navItems,
  userLabel,
  signOutAction,
  rightSlot,
  children,
}: {
  brandTitle: string;
  brandSubtitle?: string;
  homeHref: string;
  navItems: CrmNavItem[];
  userLabel?: string;
  signOutAction: () => void | Promise<void>;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--crm-bg,#263b55)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--crm-border,#3d5878)] bg-[var(--crm-sidebar,#223a55)] lg:flex">
        <Link href={homeHref} className="flex flex-col gap-0.5 border-b border-[var(--crm-border,#3d5878)] px-5 py-5 leading-tight">
          <span className="font-heading text-[15px] font-bold text-white">{brandTitle}</span>
          {brandSubtitle && <span className="text-[10.5px] font-medium text-[var(--crm-text-muted,#8ca1be)]">{brandSubtitle}</span>}
        </Link>
        <SidebarNav navItems={navItems} pathname={pathname} homeHref={homeHref} />
        <div className="border-t border-[var(--crm-border,#3d5878)] px-3 py-3">
          {userLabel && (
            <div className="truncate px-3 pb-2 text-[12px] text-[var(--crm-text-muted,#8ca1be)]">{userLabel}</div>
          )}
          <SignOutButton signOutAction={signOutAction} />
        </div>
      </aside>

      {/* Mobile / tablet off-canvas sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[var(--crm-sidebar,#223a55)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--crm-border,#3d5878)] px-5 py-4">
              <span className="font-heading text-[15px] font-bold text-white">{brandTitle}</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-[var(--crm-text-soft,#c3d0e3)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav navItems={navItems} pathname={pathname} homeHref={homeHref} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-[var(--crm-border,#3d5878)] px-3 py-3">
              {userLabel && (
                <div className="truncate px-3 pb-2 text-[12px] text-[var(--crm-text-muted,#8ca1be)]">{userLabel}</div>
              )}
              <SignOutButton signOutAction={signOutAction} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / tablet top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--crm-border,#3d5878)] bg-[var(--crm-sidebar,#223a55)] px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-white"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-heading text-[14.5px] font-bold text-white">{brandTitle}</span>
          <div className="flex h-6 w-6 items-center justify-center">{rightSlot}</div>
        </header>

        {/* Desktop top bar - only rendered when there's something to show there */}
        {rightSlot && (
          <header className="sticky top-0 z-30 hidden items-center justify-end gap-4 border-b border-[var(--crm-border,#3d5878)] bg-[var(--crm-bg,#263b55)] px-6 py-3 lg:flex">
            {rightSlot}
          </header>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
