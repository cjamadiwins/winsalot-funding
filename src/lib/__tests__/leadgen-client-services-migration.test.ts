import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static checks on the migration: the Hidebrandt-only seed values and the
// "no broad grants" security shape. (The migration is also executed against a
// scratch Postgres during verification.)
const sql = fs.readFileSync(path.resolve(import.meta.dirname, "../../../supabase/migrations/20261002030000_leadgen_client_services_pricing.sql"), "utf8");
const code = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

describe("seed data", () => {
  it("is keyed to Hidebrandt Web Services only", () => {
    expect(code).toMatch(/where c\.slug = 'hidebrandt-web-services'/);
    expect(code.match(/c\.slug = /g)).toHaveLength(1);
    expect(code).not.toMatch(/teknokraft|web6|mantra|brent/i);
  });
  it("carries each client-supplied price", () => {
    for (const fragment of [
      "'Brochure-Style Website'", "'starting_at', 465.00",
      "'E-commerce Website'", "'starting_at', 1395.00",
      "'Website Hosting'", "'monthly', 10.00::numeric, true, 'Two-year signup'",
      "'Domain + SSL'", "'annual', 50.00",
      "'Custom Development / Custom Work'", "'hourly', 46.50",
    ]) expect(code).toContain(fragment);
  });
  it("lists the e-commerce additional charges and the platform approach as a client preference", () => {
    for (const item of ["'Plugins'", "'Extensions'", "'Payment-provider integrations'", "'Shipping-provider integrations'", "'Third-party integrations'", "'Other custom e-commerce requirements'"]) expect(code).toContain(item);
    expect(code).toContain("Magento, Shopware");
    expect(code).toContain("Shopify, eBay, or Facebook Marketplace");
    expect(code).toContain("not a Winsalot Corp. opinion or recommendation");
    expect(code).toContain("Pricing is intended to be transparent.");
  });
  it("is idempotent", () => expect(code).toMatch(/not exists/));
});

describe("access model", () => {
  it("grants authenticated SELECT only - no insert/update/delete/all", () => {
    expect(code).toMatch(/grant select on table public\.leadgen_client_services to authenticated/);
    expect(code).not.toMatch(/grant (insert|update|delete|all)[^;]*to authenticated/i);
    expect(code).toMatch(/revoke all on table public\.leadgen_client_services from anon, authenticated/);
  });
  it("only has select policies: Admin, and agents for active entries of assigned clients; none for clients", () => {
    const policies = [...code.matchAll(/create policy "([^"]+)"[\s\S]*?on public\.(\w+) for (\w+)/g)].map((m) => [m[1], m[2], m[3]]);
    expect(policies.every(([, , op]) => op === "select")).toBe(true);
    expect(policies.map(([name]) => name)).toEqual([
      "leadgen_client_services_admin_select",
      "leadgen_client_services_agent_select_assigned",
      "leadgen_client_service_history_admin_select",
    ]);
    expect(code).toMatch(/leadgen_agent_client_allowed\(auth\.uid\(\), client_id\)/);
    expect(code).toMatch(/is_active = true/);
    expect(code).not.toMatch(/leadgen_user_client_id/);
  });
  it("logs history by trigger and has no way to delete an entry through the app", () => {
    expect(code).toMatch(/create trigger leadgen_client_services_history_trigger[\s\S]*after insert or update/);
  });
});
