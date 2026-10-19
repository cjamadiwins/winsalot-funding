import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const REPORT_FILES = [
  "src/lib/dialpad-reconciliation.ts",
  "src/lib/dialpad-reconciliation-data.ts",
  "src/components/dialpad/DialpadReconciliationReport.tsx",
  "src/app/leadgen/admin/(dashboard)/dialpad/reconciliation/page.tsx",
  "src/app/admin/(dashboard)/crm/dialpad/reconciliation/page.tsx",
];

describe("Dialpad reconciliation report is read-only", () => {
  it.each(REPORT_FILES)("%s contains no database write, RPC, auto-import or server action", (file) => {
    // Strip comments so explanatory text can mention these words.
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(/);
    expect(source).not.toMatch(/ensureLatestDialpadReportImported|importLeadDialpadReportAction|importGrowthDialpadReportAction/);
    expect(source).not.toMatch(/["']use server["']/);
    expect(source).not.toMatch(/method=["']post["']/i);
  });

  it("only selects from the call-log, user, campaign and client tables", () => {
    const source = read("src/lib/dialpad-reconciliation-data.ts");
    const tables = [...source.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]).sort();
    expect(tables).toEqual(["crm_call_logs", "crm_users", "leadgen_call_logs", "leadgen_campaigns", "leadgen_clients", "leadgen_users"]);
  });

  it("each page checks administrator access before loading any data", () => {
    const lead = read("src/app/leadgen/admin/(dashboard)/dialpad/reconciliation/page.tsx");
    const growth = read("src/app/admin/(dashboard)/crm/dialpad/reconciliation/page.tsx");
    expect(lead.indexOf("await requireLeadgenAdmin()")).toBeGreaterThan(-1);
    expect(lead.indexOf("await requireLeadgenAdmin()")).toBeLessThan(lead.indexOf("loadDialpadReconciliation(await"));
    expect(growth.indexOf("await requireCrmAdmin()")).toBeGreaterThan(-1);
    expect(growth.indexOf("await requireCrmAdmin()")).toBeLessThan(growth.indexOf("loadDialpadReconciliation(await"));
  });
});
