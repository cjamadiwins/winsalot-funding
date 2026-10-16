import { beforeEach, expect, it, vi } from "vitest";
import { GOODNESS_ID, GOODNESS_ROWS } from "./fixtures/payroll-oct-2026-attendance";

const m = vi.hoisted(() => ({ calls: [] as { table: string; filters: Record<string, unknown> }[], tables: {} as Record<string, unknown[]> }));
vi.mock("../supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const call = { table, filters: {} as Record<string, unknown> };
      m.calls.push(call);
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => ((call.filters[k] = v), q),
        gte: (k: string, v: unknown) => ((call.filters[`${k}>=`] = v), q),
        lte: (k: string, v: unknown) => ((call.filters[`${k}<=`] = v), q),
        order: () => q,
        maybeSingle: async () => ({ data: table.endsWith("_users") ? { scheduled_start_time: null } : null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: m.tables[table] ?? [], error: null }),
      };
      return q;
    },
  }),
}));
import { loadPayrollAttendance } from "../payroll-attendance-data";
import { buildPayPeriodHourlySummary } from "../crm-attendance-report";

beforeEach(() => { m.calls = []; m.tables = {}; });

it("an agent whose attendance is only in the Lead Gen table is no longer read as 0 days (the reported bug)", async () => {
  // The shared agents view routes this agent to the Growth CRM, whose table is empty.
  m.tables = { agent_attendance: [], leadgen_agent_attendance: GOODNESS_ROWS };
  const loaded = await loadPayrollAttendance(GOODNESS_ID, "2026-10-03", "2026-10-16");
  expect(loaded.error).toBeUndefined();
  expect(loaded.data!.sourceCounts).toEqual({ growth: 0, leadgen: GOODNESS_ROWS.length });
  const hourly = buildPayPeriodHourlySummary(loaded.data!.rows, "2026-10-03", "2026-10-16", "2026-10-16", loaded.data!.scheduledStartTime);
  expect(hourly.daysPresent).toBe(8);
  expect(hourly.missedDays).toBe(1);
});

it("matches by employee id on both attendance tables, never by name or email", async () => {
  await loadPayrollAttendance(GOODNESS_ID, "2026-10-03", "2026-10-16");
  const attendance = m.calls.filter((c) => c.table.endsWith("agent_attendance"));
  expect(attendance.map((c) => c.table).sort()).toEqual(["agent_attendance", "leadgen_agent_attendance"]);
  for (const c of attendance) expect(c.filters.agent_id).toBe(GOODNESS_ID);
  expect(m.calls.some((c) => "email" in c.filters || "full_name" in c.filters)).toBe(false);
});

it("looks back before the period so a long record running into it is seen, and reads only (no writes)", async () => {
  await loadPayrollAttendance(GOODNESS_ID, "2026-10-03", "2026-10-16");
  const call = m.calls.find((c) => c.table === "leadgen_agent_attendance")!;
  expect(call.filters["clock_in>="]).toBe("2026-09-26T00:00:00.000Z");
  expect(call.filters["clock_in<="]).toBe("2026-10-17T23:59:59.999Z");
});

it("collapses the same shift stored in both tables to one", async () => {
  const r = GOODNESS_ROWS[2];
  m.tables = { agent_attendance: [{ ...r, id: "growth-copy", clock_in: "2026-10-05T14:00:55.000Z" }], leadgen_agent_attendance: [r] };
  const loaded = await loadPayrollAttendance(GOODNESS_ID, "2026-10-03", "2026-10-16");
  expect(loaded.data!.rows).toHaveLength(1);
  expect(loaded.data!.duplicatesRemoved).toBe(1);
});
