import { describe, expect, it } from "vitest";
import { findActiveNavHref } from "../crm-nav-active";

// Regression coverage for the admin sidebar bug where both "Performance"
// and "Call Logs" lit up at once on /admin/crm/performance/call-notes,
// because "Call Logs" sits under "Performance" in the URL. Uses the same
// nav item shape/order as the real Growth CRM and Lead Gen CRM admin
// sidebars.
const HOME_HREF = "/admin/crm";
const NAV_ITEMS = [
  { href: "/admin/crm" },
  { href: "/admin/crm/payroll" },
  { href: "/admin/crm/performance" },
  { href: "/admin/crm/performance/call-notes" },
  { href: "/admin/crm/dialpad" },
].map((item) => ({ ...item, label: item.href }));

describe("findActiveNavHref", () => {
  it("highlights only Performance on /admin/crm/performance", () => {
    expect(findActiveNavHref("/admin/crm/performance", HOME_HREF, NAV_ITEMS)).toBe("/admin/crm/performance");
  });

  it("highlights only Call Logs on /admin/crm/performance/call-notes, never Performance too", () => {
    expect(findActiveNavHref("/admin/crm/performance/call-notes", HOME_HREF, NAV_ITEMS)).toBe(
      "/admin/crm/performance/call-notes"
    );
  });

  it("still highlights only Call Logs on a nested sub-route of the Call Logs page", () => {
    expect(findActiveNavHref("/admin/crm/performance/call-notes/anything", HOME_HREF, NAV_ITEMS)).toBe(
      "/admin/crm/performance/call-notes"
    );
  });

  it("matches the Lead Generation CRM's identical nav shape the same way", () => {
    const leadgenHome = "/leadgen/admin";
    const leadgenItems = [
      { href: "/leadgen/admin" },
      { href: "/leadgen/admin/performance" },
      { href: "/leadgen/admin/performance/call-notes" },
    ].map((item) => ({ ...item, label: item.href }));

    expect(findActiveNavHref("/leadgen/admin/performance", leadgenHome, leadgenItems)).toBe("/leadgen/admin/performance");
    expect(findActiveNavHref("/leadgen/admin/performance/call-notes", leadgenHome, leadgenItems)).toBe(
      "/leadgen/admin/performance/call-notes"
    );
  });

  it("highlights the home item only when the pathname is exactly the home href", () => {
    expect(findActiveNavHref("/admin/crm", HOME_HREF, NAV_ITEMS)).toBe("/admin/crm");
    expect(findActiveNavHref("/admin/crm/payroll", HOME_HREF, NAV_ITEMS)).toBe("/admin/crm/payroll");
  });

  it("returns null when no item matches", () => {
    expect(findActiveNavHref("/admin/crm/some-unrelated-page", HOME_HREF, NAV_ITEMS)).toBeNull();
  });
});
