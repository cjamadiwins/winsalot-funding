"use client";

import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import ClientLocalTimePanel from "./ClientLocalTimePanel";
import type { LocationCountry } from "@/lib/timezone-locations";
import type { TimeZonePreferences } from "@/lib/user-time-zone-preferences";

// `icon` takes an already-rendered element (e.g. `<Users />`), not a
// component reference - every layout using CrmShell is a Server
// Component, and a bare component reference (a function) can't cross
// the server/client boundary as a prop, only a rendered element can.
// `badgeCount` is optional and only meant for a count that should stay
// visible until some backlog is cleared (e.g. pending leave requests
// awaiting admin review) - omit it (or pass 0) for every nav item that
// doesn't need one, which is every existing item today.
export type CrmNavItem = { label: string; href: string; icon: ReactNode; badgeCount?: number };

function isNavItemActive(pathname: string, homeHref: string, href: string) {
  if (href === homeHref) return pathname === homeHref;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Sidebar brand block, top-level for the same stable-identity reason as
// SidebarNav below. `logoSrc` is optional - most CRM portals still get
// the plain text brandTitle/brandSubtitle they always have; only a
// portal that explicitly opts in (passing logoSrc) gets the logo-on-a-
// white-chip treatment, so this is a strict visual addition for those
// portals and a no-op for every other one.
function BrandHeader({
  brandTitle,
  brandSubtitle,
  logoSrc,
}: {
  brandTitle: string;
  brandSubtitle?: ReactNode;
  logoSrc?: string;
}) {
  if (!logoSrc) {
    return (
      <>
        <span className="font-heading text-[15px] font-bold text-white">{brandTitle}</span>
        {brandSubtitle && <span className="text-[10.5px] font-medium text-[var(--crm-sidebar-text-muted,#8ca1be)]">{brandSubtitle}</span>}
      </>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <span className="rounded-xl bg-white p-2 shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt={brandTitle} className="block h-[76px] w-[76px] object-contain" />
      </span>
      {brandSubtitle && (
        <span className="max-w-[200px] text-[15px] font-bold leading-relaxed text-white">
          {brandSubtitle}
        </span>
      )}
      <span className="text-[16px] font-bold uppercase tracking-wider text-[var(--crm-sidebar-text-muted,#8ca1be)]">{brandTitle}</span>
    </div>
  );
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
                : "text-[var(--crm-sidebar-text-soft,#c3d0e3)] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {iconEl}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {!!item.badgeCount && item.badgeCount > 0 && (
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                  active ? "bg-white/25 text-white" : "bg-rose-600 text-white"
                }`}
              >
                {item.badgeCount > 9 ? "9+" : item.badgeCount}
              </span>
            )}
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
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[var(--crm-sidebar-text-soft,#c3d0e3)] transition hover:bg-white/[0.06] hover:text-white"
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
  brandLogoSrc,
  homeHref,
  navItems,
  userLabel,
  signOutAction,
  rightSlot,
  clientLocalTime,
  children,
}: {
  brandTitle: string;
  brandSubtitle?: ReactNode;
  // Path to a logo image (e.g. "/winsalot-logo.png") to show above
  // brandTitle/brandSubtitle on a white chip. Optional - omit to keep
  // the original text-only sidebar header every other portal already
  // has.
  brandLogoSrc?: string;
  homeHref: string;
  navItems: CrmNavItem[];
  userLabel?: string;
  signOutAction: () => void | Promise<void>;
  rightSlot?: ReactNode;
  clientLocalTime: {
    initialPreferences: TimeZonePreferences;
    saveLocationsAction: (
      location1: { country: LocationCountry; regionCode: string; city: string },
      location2: { country: LocationCountry; regionCode: string; city: string }
    ) => Promise<{ error?: string }>;
    resetLocationsAction: () => Promise<{ error?: string }>;
    // "photoHero" = full-bleed skyline art with time/weather overlaid
    // directly on it (Lead Gen admin's redesign); omit for the original
    // small-strip-plus-white-body card every other portal keeps.
    cardVariant?: "default" | "photoHero";
  };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--crm-bg,#f4f7fa)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--crm-sidebar-border,#33496a)] bg-[var(--crm-sidebar,#223a55)] lg:flex">
        <Link
          href={homeHref}
          className={
            brandLogoSrc
              ? "flex flex-col items-center border-b border-[var(--crm-sidebar-border,#33496a)] px-5 py-6"
              : "flex flex-col gap-0.5 border-b border-[var(--crm-sidebar-border,#33496a)] px-5 py-5 leading-tight"
          }
        >
          <BrandHeader brandTitle={brandTitle} brandSubtitle={brandSubtitle} logoSrc={brandLogoSrc} />
        </Link>
        <SidebarNav navItems={navItems} pathname={pathname} homeHref={homeHref} />
        <div className="border-t border-[var(--crm-sidebar-border,#33496a)] px-3 py-3">
          {userLabel && (
            <div className="truncate px-3 pb-2 text-[12px] text-[var(--crm-sidebar-text-muted,#8ca1be)]">{userLabel}</div>
          )}
          <SignOutButton signOutAction={signOutAction} />
        </div>
      </aside>

      {/* Mobile / tablet off-canvas sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[var(--crm-sidebar,#223a55)] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--crm-sidebar-border,#33496a)] px-5 py-4">
              {brandLogoSrc ? (
                <BrandHeader brandTitle={brandTitle} brandSubtitle={brandSubtitle} logoSrc={brandLogoSrc} />
              ) : (
                <span className="font-heading text-[15px] font-bold text-white">{brandTitle}</span>
              )}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-[var(--crm-sidebar-text-soft,#c3d0e3)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav navItems={navItems} pathname={pathname} homeHref={homeHref} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-[var(--crm-sidebar-border,#33496a)] px-3 py-3">
              {userLabel && (
                <div className="truncate px-3 pb-2 text-[12px] text-[var(--crm-sidebar-text-muted,#8ca1be)]">{userLabel}</div>
              )}
              <SignOutButton signOutAction={signOutAction} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / tablet top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--crm-sidebar-border,#33496a)] bg-[var(--crm-sidebar,#223a55)] px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-white"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            {brandLogoSrc && (
              <span className="flex items-center rounded-md bg-white p-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brandLogoSrc} alt="" className="block h-[22px] w-[22px] object-contain" />
              </span>
            )}
            <span className="font-heading text-[14.5px] font-bold text-white">{brandTitle}</span>
          </div>
          <div className="flex h-6 w-6 items-center justify-center">{rightSlot}</div>
        </header>

        {/* Desktop top bar - only rendered when there's something to show there */}
        {rightSlot && (
          <header className="sticky top-0 z-30 hidden items-center justify-end gap-4 border-b border-[var(--crm-border,#dce4ec)] bg-[var(--crm-bg,#f4f7fa)] px-6 py-3 lg:flex">
            {rightSlot}
          </header>
        )}

        <ClientLocalTimePanel
          initialPreferences={clientLocalTime.initialPreferences}
          saveLocationsAction={clientLocalTime.saveLocationsAction}
          resetLocationsAction={clientLocalTime.resetLocationsAction}
          cardVariant={clientLocalTime.cardVariant}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
