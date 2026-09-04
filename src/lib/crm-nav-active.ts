// Sidebar active-item matching, shared by CrmShell (every logged-in CRM
// area: Growth admin/agent, Lead Gen admin/agent, Lead Gen client) - a
// plain function rather than component-local logic so it can be unit
// tested without rendering.
export type CrmNavHrefItem = { href: string };

function navItemMatches(pathname: string, homeHref: string, href: string): boolean {
  if (href === homeHref) return pathname === homeHref;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Picks exactly one active nav item, even when hrefs nest (e.g. "Call
// Logs" at /admin/crm/performance/call-notes sits under "Performance" at
// /admin/crm/performance) - both would independently match a prefix
// check, so instead every item's href is checked against the current
// pathname and the *longest* (most specific) matching href wins. On
// /admin/crm/performance/call-notes that's "Call Logs"; on
// /admin/crm/performance itself, "Call Logs" doesn't match at all (its
// href isn't a prefix of the pathname), so only "Performance" does.
export function findActiveNavHref<T extends CrmNavHrefItem>(pathname: string, homeHref: string, navItems: T[]): string | null {
  let activeHref: string | null = null;
  for (const item of navItems) {
    if (!navItemMatches(pathname, homeHref, item.href)) continue;
    if (!activeHref || item.href.length > activeHref.length) activeHref = item.href;
  }
  return activeHref;
}
