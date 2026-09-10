import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { opportunityPriorityLevel, opportunityTodayKey, wasOpportunityHandledToday } from "../opportunity-finder";

describe("Smart Opportunity priority levels", () => {
  it.each([
    [0, "monitor"],
    [59, "monitor"],
    [60, "warm"],
    [79, "warm"],
    [80, "hot"],
    [100, "hot"],
  ] as const)("maps score %i to %s", (score, expected) => {
    expect(opportunityPriorityLevel(score)).toBe(expected);
  });

  it("uses the Toronto business day for the daily handled state", () => {
    const justBeforeMidnightToronto = new Date("2026-09-10T03:30:00.000Z");
    expect(opportunityTodayKey(justBeforeMidnightToronto)).toBe("2026-09-09");
    expect(wasOpportunityHandledToday("2026-09-09", "2026-09-09")).toBe(true);
    expect(wasOpportunityHandledToday("2026-09-08", "2026-09-09")).toBe(false);
  });
});

describe("Smart Opportunity database contract", () => {
  const migrationsDirectory = path.resolve(__dirname, "../../../supabase/migrations");
  const allMigrations = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDirectory, file), "utf8"))
    .join("\n");
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../../../supabase/migrations/0151_smart_opportunity_scoring.sql"),
    "utf8"
  );

  it("keeps Growth and Lead Generation scoring on their separate source tables", () => {
    const growthFunction = migration.slice(
      migration.indexOf("create or replace function public.crm_recompute_opportunity_score"),
      migration.indexOf("-- Lead Generation CRM")
    );
    const leadgenFunction = migration.slice(
      migration.indexOf("-- Lead Generation CRM"),
      migration.indexOf("revoke execute on function public.crm_recompute_opportunity_score")
    );

    expect(growthFunction).toContain("public.crm_opportunities");
    expect(growthFunction).not.toContain("public.leadgen_leads");
    expect(leadgenFunction).toContain("public.leadgen_leads");
    expect(leadgenFunction).not.toContain("from public.crm_opportunities");
  });

  it("contains the agreed positive, negative, and 0-100 clamp rules", () => {
    for (const rule of [
      "Interested lead (+30)",
      "Callback requested (+25)",
      "Decision-maker reached (+15)",
      "Positive call notes (+15)",
      "Follow-up due today (+15)",
      "Follow-up overdue (+10)",
      "Appointment discussed but not booked (+20)",
      "Recent contact within 7 days (+10)",
      "Multiple meaningful conversations (+10)",
      "Tracked email opened or clicked (+10)",
      "Repeated no answer without engagement (-15)",
      "Inactive for more than 60 days (-15)",
      "Appointment already booked (-20)",
    ]) {
      expect(migration).toContain(rule);
    }
    expect(migration.match(/greatest\(0, least\(v_score, 100\)\)/g)).toHaveLength(2);
  });

  it("preserves automatic recomputation and restricts the handled marker to today", () => {
    expect(migration).toContain("new.handled_on is distinct from timezone('America/Toronto', now())::date");
    expect(migration).toContain("perform public.crm_recompute_opportunity_score(rec.id)");
    expect(migration).toContain("perform public.leadgen_recompute_opportunity_score(rec.id)");
  });

  it("retains agent assignment RLS and activity-driven recompute triggers", () => {
    expect(allMigrations).toContain('create policy "crm_opportunity_scores_agent_select_own"');
    expect(allMigrations).toContain("o.assigned_agent_id = auth.uid()");
    expect(allMigrations).toContain('create policy "leadgen_opportunity_scores_agent_select_own"');
    expect(allMigrations).toContain("l.assigned_agent_id = auth.uid()");
    expect(allMigrations).toContain("crm_opportunity_scores_activities_trigger");
    expect(allMigrations).toContain("crm_opportunity_scores_followups_trigger");
    expect(allMigrations).toContain("crm_opportunity_scores_appointments_trigger");
    expect(allMigrations).toContain("leadgen_opportunity_scores_activities_trigger");
    expect(allMigrations).toContain("leadgen_opportunity_scores_followups_trigger");
    expect(allMigrations).toContain("leadgen_opportunity_scores_appointments_trigger");
  });
});

describe("Smart Opportunity dashboard integration", () => {
  const source = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");

  it.each([
    "../../app/admin/(dashboard)/crm/page.tsx",
    "../../app/agent/(dashboard)/dashboard/page.tsx",
    "../../app/leadgen/admin/(dashboard)/page.tsx",
    "../../app/leadgen/agent/(dashboard)/page.tsx",
  ])("places the modal launcher directly on %s", (relativePath) => {
    expect(source(relativePath)).toContain("<SmartOpportunitiesModal");
  });
});
