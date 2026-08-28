import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural regression guard for the Generic Winsalot Training
// Portal's RLS (migration 0105), same technique as
// crm-invoice-agent-permissions.test.ts: reads the actual migration SQL
// text so a future edit that quietly widens agent access, or removes the
// admin-only guard on the audit log, fails this test immediately rather
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

describe("crm_training_progress: agents can only read/write their own row", () => {
  const policies = policiesOn("crm_training_progress");

  it("has at least one admin-only policy", () => {
    expect(policies.some((p) => p.name.includes("admin"))).toBe(true);
  });

  it("every non-admin policy scopes to user_id = auth.uid()", () => {
    const nonAdmin = policies.filter((p) => !p.name.includes("admin"));
    expect(nonAdmin.length).toBeGreaterThan(0);
    for (const policy of nonAdmin) {
      expect(policy.body).toContain("user_id = auth.uid()");
    }
  });

  it("has no unrestricted select policy that could expose another user's progress", () => {
    const selectPolicies = [...allMigrationSql.matchAll(/create policy "([^"]+)" on public\.crm_training_progress for select\s+using \(([\s\S]*?)\);/g)];
    expect(selectPolicies.length).toBeGreaterThan(0);
    for (const [, name, usingClause] of selectPolicies) {
      const isAdminOnly = usingClause.includes("crm_user_role(auth.uid()) = 'admin'");
      const isSelfOnly = usingClause.includes("user_id = auth.uid()");
      expect(isAdminOnly || isSelfOnly, `select policy "${name}" is neither admin-only nor self-scoped: ${usingClause}`).toBe(true);
    }
  });

  it("has no agent-facing delete policy (only an admin can reset/remove a progress row)", () => {
    const deletePolicies = [...allMigrationSql.matchAll(/create policy "([^"]+)" on public\.crm_training_progress for (delete|all)/g)];
    for (const [, name] of deletePolicies) {
      expect(name).toContain("admin");
    }
  });
});

describe("crm_training_admin_actions: admin-only audit log", () => {
  const policies = policiesOn("crm_training_admin_actions");

  it("has exactly one policy and it is admin-only", () => {
    expect(policies.length).toBe(1);
    expect(policies[0].name).toContain("admin");
  });
});

describe("crm_training_modules / crm_training_module_versions: agents see only active, assigned modules", () => {
  it("the agent-select policy on crm_training_modules requires is_active = true and an agent assignment", () => {
    const match = allMigrationSql.match(/create policy "crm_training_modules_agent_select_assigned" on public\.crm_training_modules for select\s+using \(([\s\S]*?)\);/);
    expect(match).toBeTruthy();
    const body = match![1];
    expect(body).toContain("is_active = true");
    expect(body).toContain("assigned_role = 'agent'");
  });

  it("the agent-select policy on crm_training_module_versions requires the parent module to be active and assigned", () => {
    const match = allMigrationSql.match(
      /create policy "crm_training_module_versions_agent_select_assigned" on public\.crm_training_module_versions for select\s+using \(([\s\S]*?)\);/
    );
    expect(match).toBeTruthy();
    const body = match![1];
    expect(body).toContain("m.is_active = true");
    expect(body).toContain("a.assigned_role = 'agent'");
  });
});

describe("every crm_training_* table has row level security enabled", () => {
  const tables = [
    "crm_training_modules",
    "crm_training_module_versions",
    "crm_training_module_assignments",
    "crm_training_progress",
    "crm_training_admin_actions",
  ];

  for (const table of tables) {
    it(`${table} has RLS enabled`, () => {
      expect(allMigrationSql).toContain(`alter table public.${table} enable row level security`);
    });
  }
});
