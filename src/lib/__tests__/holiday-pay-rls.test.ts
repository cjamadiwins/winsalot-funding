import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural regression guard for Holiday Pay's RLS (migration
// 0106_holiday_pay.sql), same technique as
// crm-training-permissions.test.ts / crm-invoice-agent-permissions.test.ts:
// reads the actual migration SQL text so a future edit that quietly widens
// agent access, drops the cross-CRM dedup guarantee, or removes the
// admin-only guard on the audit log fails this test immediately rather
// than only being caught by manual review.

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const allMigrationSql = migrationFiles.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");

function policiesOn(table: string): { name: string; body: string }[] {
  const results: { name: string; body: string }[] = [];
  const re = new RegExp(`create policy "([^"]+)" on public\\.${table} for \\w+([\\s\\S]*?);`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(allMigrationSql))) {
    results.push({ name: match[1], body: match[0] });
  }
  return results;
}

describe("holidays: shared calendar, admin-managed from either CRM, agent read scoped to their own assignment", () => {
  const policies = policiesOn("holidays");

  it("has RLS enabled", () => {
    expect(allMigrationSql).toContain("alter table public.holidays enable row level security");
  });

  it("has an admin-all policy that accepts either CRM's admin role", () => {
    const adminPolicy = policies.find((p) => p.name.includes("admin"));
    expect(adminPolicy).toBeTruthy();
    expect(adminPolicy!.body).toContain("crm_user_role(auth.uid()) = 'admin'");
    expect(adminPolicy!.body).toContain("leadgen_user_role(auth.uid()) = 'admin'");
  });

  it("the agent select policy requires an active assignment and excludes deleted holidays", () => {
    const agentPolicy = policies.find((p) => p.name.includes("agent"));
    expect(agentPolicy).toBeTruthy();
    expect(agentPolicy!.body).toContain("holidays.deleted_at is null");
    expect(agentPolicy!.body).toContain("hpa.status = 'assigned'");
  });

  it("has no unrestricted select policy exposing the full calendar to every agent", () => {
    const selectPolicies = [
      ...allMigrationSql.matchAll(/create policy "([^"]+)" on public\.holidays for select\s+using \(([\s\S]*?)\);/g),
    ];
    expect(selectPolicies.length).toBeGreaterThan(0);
    for (const [, name, usingClause] of selectPolicies) {
      const isAdminOnly =
        usingClause.includes("crm_user_role(auth.uid()) = 'admin'") ||
        usingClause.includes("leadgen_user_role(auth.uid()) = 'admin'");
      const isAssignmentScoped = usingClause.includes("holiday_pay_assignments");
      expect(isAdminOnly || isAssignmentScoped, `select policy "${name}" is neither admin nor assignment-scoped: ${usingClause}`).toBe(
        true
      );
    }
  });
});

describe("holiday_pay_assignments: admin-managed, agent can only ever read their own rows", () => {
  const policies = policiesOn("holiday_pay_assignments");

  it("has RLS enabled", () => {
    expect(allMigrationSql).toContain("alter table public.holiday_pay_assignments enable row level security");
  });

  it("has no agent-facing insert/update/delete policy - only the admin-all policy can write", () => {
    const writePolicies = [
      ...allMigrationSql.matchAll(/create policy "([^"]+)" on public\.holiday_pay_assignments for (insert|update|delete|all)/g),
    ];
    expect(writePolicies.length).toBeGreaterThan(0);
    for (const [, name] of writePolicies) {
      expect(name).toContain("admin");
    }
  });

  it("the agent select-own policy scopes to either crm_user_id or leadgen_user_id matching auth.uid()", () => {
    const agentPolicy = policies.find((p) => p.name.includes("agent"));
    expect(agentPolicy).toBeTruthy();
    expect(agentPolicy!.body).toContain("crm_user_id = auth.uid()");
    expect(agentPolicy!.body).toContain("leadgen_user_id = auth.uid()");
  });

  it("enforces the cross-CRM duplicate-payment guard: one active assignment per (holiday, shared identity)", () => {
    expect(allMigrationSql).toContain(
      "create unique index if not exists holiday_pay_assignments_unique_identity_per_holiday"
    );
    const match = allMigrationSql.match(
      /create unique index if not exists holiday_pay_assignments_unique_identity_per_holiday\s+on public\.holiday_pay_assignments\(([\s\S]*?)\)\s+where ([\s\S]*?);/
    );
    expect(match).toBeTruthy();
    expect(match![1]).toContain("holiday_id");
    expect(match![1]).toContain("shared_identity_key");
    expect(match![2]).toContain("status = 'assigned'");
  });

  it("requires an explanation whenever an amount is overridden", () => {
    expect(allMigrationSql).toContain("holiday_pay_assignments_override_reason_required");
    expect(allMigrationSql).toContain("override_amount is null or (override_reason is not null");
  });
});

describe("holiday_pay_audit_log: append-only, admin-only", () => {
  const policies = policiesOn("holiday_pay_audit_log");

  it("has RLS enabled", () => {
    expect(allMigrationSql).toContain("alter table public.holiday_pay_audit_log enable row level security");
  });

  it("has exactly select and insert policies, both admin-only, and no update/delete policy", () => {
    expect(policies.length).toBe(2);
    for (const policy of policies) {
      expect(policy.name).toContain("admin");
    }
    const writeLevelPolicies = [
      ...allMigrationSql.matchAll(/create policy "([^"]+)" on public\.holiday_pay_audit_log for (update|delete)/g),
    ];
    expect(writeLevelPolicies.length).toBe(0);
  });
});

describe("crm_payroll / leadgen_payroll: holiday_pay is included in the final total", () => {
  it("crm_payroll's total_pay generated expression includes holiday_pay", () => {
    const matches = [...allMigrationSql.matchAll(/generated always as \(([\s\S]*?)\) stored/g)];
    const crmPayrollExpr = matches.map((m) => m[1]).find((expr) => expr.includes("bonus_commission") && expr.includes("holiday_pay"));
    expect(crmPayrollExpr).toBeTruthy();
    expect(crmPayrollExpr).toContain("+ holiday_pay");
  });

  it("both payroll audit-log action enums accept holiday_pay_changed and require a reason for it", () => {
    expect(allMigrationSql).toContain("crm_payroll_audit_log_action_check check (action in (");
    expect(allMigrationSql).toContain("leadgen_payroll_audit_log_action_check check (action in (");
    const occurrences = allMigrationSql.match(/'holiday_pay_changed'/g) ?? [];
    // Appears once per table in the action-check enum and once per table
    // in the reason-required list - 4 total across crm_payroll and
    // leadgen_payroll's audit log constraints.
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
  });
});

describe("every holiday-pay table has row level security enabled", () => {
  const tables = ["holidays", "holiday_pay_assignments", "holiday_pay_audit_log"];

  for (const table of tables) {
    it(`${table} has RLS enabled`, () => {
      expect(allMigrationSql).toContain(`alter table public.${table} enable row level security`);
    });
  }
});
