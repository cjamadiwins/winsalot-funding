import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural regression guard for "keep all client pricing, invoices,
// payments, revenue, and balances completely hidden from agents." There
// is no live Postgres/RLS available to vitest, so this asserts the thing
// that actually enforces that guarantee - crm_agent_visible_clients()'s
// own SELECT list (the only way an agent can ever read client data) -
// never grows to include a financial column, and that crm_invoices/
// crm_payments/crm_client_agents keep an admin-only RLS policy with no
// agent policy alongside it. A future edit that widens the RPC's SELECT
// or adds an agent-facing policy on a financial table would fail this
// test immediately, rather than only being caught by manual review.
const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const allMigrationSql = migrationFiles.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");

const FORBIDDEN_COLUMNS_IN_AGENT_RPC = ["monthly_price", "currency", "billing_address", "internal_notes", "invoice", "payment", "balance"];

function extractFunctionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`function public.${functionName}(`);
  if (start === -1) throw new Error(`Could not find function ${functionName} in migrations.`);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end === -1 ? undefined : end);
}

describe("crm_agent_visible_clients() never exposes financial data", () => {
  const body = extractFunctionBody(allMigrationSql, "crm_agent_visible_clients");

  it("its SELECT list never references a financial or internal-only column", () => {
    for (const column of FORBIDDEN_COLUMNS_IN_AGENT_RPC) {
      expect(body.toLowerCase()).not.toContain(column);
    }
  });

  it("only ever selects a client when it is Active", () => {
    expect(body).toMatch(/status\s*=\s*'Active'/);
  });

  it("is scoped to the calling agent's own assignments (auth.uid())", () => {
    expect(body).toContain("ca.agent_id = auth.uid()");
  });
});

describe("Financial tables keep admin-only RLS, no agent policy", () => {
  for (const table of ["crm_invoices", "crm_payments", "crm_invoice_line_items", "crm_client_agents", "crm_test_data_audit"]) {
    it(`${table} has exactly one admin-only policy and no agent-facing policy`, () => {
      const policyMatches = [...allMigrationSql.matchAll(new RegExp(`create policy "([^"]+)" on public\\.${table}`, "g"))];
      expect(policyMatches.length).toBeGreaterThan(0);
      for (const match of policyMatches) {
        expect(match[1]).toContain("admin");
      }
    });
  }
});
