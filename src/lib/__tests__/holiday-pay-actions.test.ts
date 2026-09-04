import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked server-action tests for src/lib/holiday-pay-actions.ts, same
// technique as crm-opportunity-deletion.test.ts: every dependency
// (auth, Supabase client, revalidatePath) is mocked, so this exercises
// each action's own logic - validation, admin-only gating, and the
// cross-CRM dedup handling - without a live Supabase connection.

const requireCrmAdminMock = vi.fn();
vi.mock("@/lib/crm-auth", () => ({
  requireCrmAdmin: () => requireCrmAdminMock(),
}));

const requireLeadgenAdminMock = vi.fn();
vi.mock("@/lib/leadgen-auth", () => ({
  requireLeadgenAdmin: () => requireLeadgenAdminMock(),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const createSupabaseServerClientMock = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

type QueryResponse = { data?: unknown; error?: unknown };

// One queued response per `.from(table)` call, consumed in call order -
// simple enough to reason about for these actions' straight-line query
// sequences (fetch existing -> write -> audit log insert), while still
// letting each test control exactly what each step in that sequence
// returns.
function createMockSupabase(responsesByTable: Record<string, QueryResponse[]>) {
  const fromCalls: string[] = [];
  const queues: Record<string, QueryResponse[]> = Object.fromEntries(
    Object.entries(responsesByTable).map(([table, list]) => [table, [...list]])
  );

  function makeChain(response: QueryResponse) {
    const resolved = { data: response.data ?? null, error: response.error ?? null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "not", "is", "order", "insert", "update", "delete"]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolved));
    chain.single = vi.fn(() => Promise.resolve(resolved));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject);
    return chain;
  }

  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    const queue = queues[table] ?? [];
    const response = queue.shift() ?? { data: null, error: null };
    return makeChain(response);
  });

  return { from, fromCalls };
}

const growthAdmin = { id: "admin-crm-1", full_name: "Growth Admin", email: "growth-admin@winsalotcorp.com" };
const leadgenAdmin = { id: "admin-leadgen-1", full_name: "Leadgen Admin", email: "leadgen-admin@winsalotcorp.com" };

beforeEach(() => {
  vi.clearAllMocks();
  requireCrmAdminMock.mockResolvedValue(growthAdmin);
  requireLeadgenAdminMock.mockResolvedValue(leadgenAdmin);
});

describe("createHolidayAction", () => {
  it("rejects when required fields are missing", async () => {
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("holiday_date", "2026-09-07");
    formData.set("jurisdiction", "Canada/Ontario");
    formData.set("payment_type", "regular_paid_day");

    const result = await createHolidayAction("growth", formData);
    expect(result.error).toMatch(/name, date, and jurisdiction/i);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("rejects a fixed_amount holiday with no amount", async () => {
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("name", "Christmas");
    formData.set("holiday_date", "2026-12-25");
    formData.set("jurisdiction", "Nigeria");
    formData.set("payment_type", "fixed_amount");

    const result = await createHolidayAction("growth", formData);
    expect(result.error).toMatch(/amount is required/i);
  });

  it("creates a holiday and writes an audit row attributing the correct CRM admin", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "holiday-1" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("name", "Labour Day");
    formData.set("holiday_date", "2026-09-07");
    formData.set("jurisdiction", "Canada/Ontario");
    formData.set("payment_type", "regular_paid_day");

    const result = await createHolidayAction("leadgen", formData);
    expect(result.error).toBeUndefined();
    expect(requireLeadgenAdminMock).toHaveBeenCalledTimes(1);
    expect(mockSupabase.from).toHaveBeenCalledWith("holidays");
    expect(mockSupabase.from).toHaveBeenCalledWith("holiday_pay_audit_log");
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("propagates an admin-authorization failure without touching the database", async () => {
    requireCrmAdminMock.mockRejectedValueOnce(new Error("not an admin"));
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("name", "Test");
    formData.set("holiday_date", "2026-09-07");
    formData.set("jurisdiction", "Nigeria");
    formData.set("payment_type", "unpaid");

    await expect(createHolidayAction("growth", formData)).rejects.toThrow("not an admin");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("always writes NGN as the currency, ignoring whatever a form submits - jurisdiction (e.g. Canada/Ontario) never determines payroll currency", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "holiday-1" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("name", "Labour Day");
    formData.set("holiday_date", "2026-09-07");
    formData.set("jurisdiction", "Canada/Ontario");
    formData.set("payment_type", "regular_paid_day");
    formData.set("currency", "CAD"); // an admin (or a stale client) submitting CAD must not stick

    const result = await createHolidayAction("leadgen", formData);
    expect(result.error).toBeUndefined();

    const holidaysCallIndex = mockSupabase.fromCalls.indexOf("holidays");
    const holidaysChain = mockSupabase.from.mock.results[holidaysCallIndex].value as { insert: ReturnType<typeof vi.fn> };
    expect(holidaysChain.insert).toHaveBeenCalledWith(expect.objectContaining({ currency: "NGN", jurisdiction: "Canada/Ontario" }));
  });
});

describe("updateHolidayAction: currency always follows payroll (NGN), never the jurisdiction or a submitted value", () => {
  it("rewrites an existing CAD-tagged holiday (e.g. a Canada/Ontario one) back to NGN on save", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [
        { data: { id: "holiday-1", deleted_at: null }, error: null }, // fetch existing
        { data: null, error: null }, // update
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("name", "Labour Day");
    formData.set("holiday_date", "2026-09-07");
    formData.set("jurisdiction", "Canada/Ontario");
    formData.set("payment_type", "regular_paid_day");
    formData.set("currency", "CAD"); // stale/leftover value must not stick either

    const result = await updateHolidayAction("leadgen", "holiday-1", formData);
    expect(result.error).toBeUndefined();

    const holidaysCallIndices = mockSupabase.fromCalls
      .map((table, i) => (table === "holidays" ? i : -1))
      .filter((i) => i !== -1);
    const updateChain = mockSupabase.from.mock.results[holidaysCallIndices[1]].value as { update: ReturnType<typeof vi.fn> };
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ currency: "NGN", jurisdiction: "Canada/Ontario" }));
  });
});

describe("assignHolidayAction: assignment-based eligibility (never automatic)", () => {
  it("assigns pay only to the specific agents selected, leaving an unselected agent with no assignment", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "h1", payment_type: "regular_paid_day", amount: null, percentage: null, deleted_at: null }, error: null }],
      // The real query applies `.in("id", selectedIds)`, so only the
      // selected agent is ever returned here - Agent Two (unassigned,
      // e.g. because they were off before the holiday) never appears.
      leadgen_users: [{ data: [{ id: "agent-1", full_name: "Agent One", email: "agent1@example.com" }], error: null }],
      holiday_pay_assignments: [
        { data: null, error: null }, // agent-1: no existing row
        { data: null, error: null }, // insert succeeds
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { assignHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.append("agent_ids", "agent-1");
    const result = await assignHolidayAction("leadgen", "h1", formData);

    expect(result.error).toBeUndefined();
    expect(result.assignedCount).toBe(1);

    const assignmentsCallIndex = mockSupabase.fromCalls.indexOf("holiday_pay_assignments");
    const insertChain = mockSupabase.from.mock.results[assignmentsCallIndex + 1].value as { insert: ReturnType<typeof vi.fn> };
    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({ leadgen_user_id: "agent-1", status: "assigned" }));

    // Agent Two was never looked up, never queried for an existing row,
    // and never inserted - "leave that agent unassigned" holds exactly.
    const leadgenUsersCallIndex = mockSupabase.fromCalls.indexOf("leadgen_users");
    const usersChain = mockSupabase.from.mock.results[leadgenUsersCallIndex].value as { in: ReturnType<typeof vi.fn> };
    expect(usersChain.in).toHaveBeenCalledWith("id", ["agent-1"]);
  });

  it("never assigns anyone automatically when a holiday is created - eligibility always requires a separate, explicit Manage Assignments action", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "holiday-1" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("name", "Labour Day");
    formData.set("holiday_date", "2026-09-07");
    formData.set("jurisdiction", "Canada/Ontario");
    formData.set("payment_type", "regular_paid_day");

    await createHolidayAction("leadgen", formData);

    expect(mockSupabase.fromCalls).not.toContain("holiday_pay_assignments");
    expect(mockSupabase.fromCalls).not.toContain("leadgen_users");
    expect(mockSupabase.fromCalls).not.toContain("crm_users");
  });
});

describe("deleteHolidayAction", () => {
  it("requires confirm_delete and a reason before deleting", async () => {
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { deleteHolidayAction } = await import("@/lib/holiday-pay-actions");

    const noConfirm = new FormData();
    noConfirm.set("reason", "No longer needed");
    expect((await deleteHolidayAction("growth", "holiday-1", noConfirm)).error).toMatch(/confirm/i);

    const noReason = new FormData();
    noReason.set("confirm_delete", "true");
    expect((await deleteHolidayAction("growth", "holiday-1", noReason)).error).toMatch(/reason is required/i);
  });

  it("soft-deletes the holiday and stamps the correct CRM admin", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [
        { data: { id: "holiday-1", deleted_at: null }, error: null },
        { data: null, error: null },
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { deleteHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("confirm_delete", "true");
    formData.set("reason", "Duplicate entry");

    const result = await deleteHolidayAction("growth", "holiday-1", formData);
    expect(result.error).toBeUndefined();
    expect(mockSupabase.from).toHaveBeenCalledWith("holiday_pay_audit_log");
  });

  it("refuses to delete an already-deleted holiday", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "holiday-1", deleted_at: "2026-01-01T00:00:00Z" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { deleteHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("confirm_delete", "true");
    formData.set("reason", "Duplicate entry");

    const result = await deleteHolidayAction("growth", "holiday-1", formData);
    expect(result.error).toMatch(/already been deleted/i);
  });
});

describe("deactivateHolidayAction / overrideAssignmentAmountAction: reason required", () => {
  it("deactivateHolidayAction requires a reason", async () => {
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { deactivateHolidayAction } = await import("@/lib/holiday-pay-actions");

    const result = await deactivateHolidayAction("growth", "holiday-1", new FormData());
    expect(result.error).toMatch(/reason is required/i);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("overrideAssignmentAmountAction requires both an amount and an explanation", async () => {
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { overrideAssignmentAmountAction } = await import("@/lib/holiday-pay-actions");

    const missingReason = new FormData();
    missingReason.set("override_amount", "5000");
    expect((await overrideAssignmentAmountAction("growth", "assignment-1", missingReason)).error).toMatch(
      /explanation is required/i
    );

    const missingAmount = new FormData();
    missingAmount.set("override_reason", "Prorated for partial period");
    expect((await overrideAssignmentAmountAction("growth", "assignment-1", missingAmount)).error).toMatch(
      /valid override amount/i
    );
  });

  it("overrideAssignmentAmountAction only allows overriding an active assignment", async () => {
    const mockSupabase = createMockSupabase({
      holiday_pay_assignments: [{ data: { id: "a1", holiday_id: "h1", status: "cancelled", calculated_amount: 7500 }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { overrideAssignmentAmountAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("override_amount", "5000");
    formData.set("override_reason", "Partial period");
    const result = await overrideAssignmentAmountAction("growth", "a1", formData);
    expect(result.error).toMatch(/only an active assignment/i);
  });
});

describe("removeAssignmentAction", () => {
  it("requires a reason and refuses to remove an already-removed assignment", async () => {
    const mockSupabase = createMockSupabase({
      holiday_pay_assignments: [{ data: { id: "a1", holiday_id: "h1", status: "cancelled" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { removeAssignmentAction } = await import("@/lib/holiday-pay-actions");

    expect((await removeAssignmentAction("growth", "a1", new FormData())).error).toMatch(/reason is required/i);

    const formData = new FormData();
    formData.set("reason", "Agent left the company");
    const result = await removeAssignmentAction("growth", "a1", formData);
    expect(result.error).toMatch(/already been removed/i);
  });
});

describe("assignHolidayAction: cross-CRM duplicate-payment prevention", () => {
  it("assigns agents with no conflicting assignment and skips one already assigned within this CRM", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "h1", payment_type: "regular_paid_day", amount: null, percentage: null, deleted_at: null }, error: null }],
      crm_users: [
        {
          data: [
            { id: "agent-1", full_name: "Agent One", email: "agent1@winsalotcorp.com" },
            { id: "agent-2", full_name: "Agent Two", email: "agent2@winsalotcorp.com" },
          ],
          error: null,
        },
      ],
      holiday_pay_assignments: [
        // agent-1: no existing row -> insert
        { data: null, error: null },
        { data: null, error: null }, // insert succeeds
        // agent-2: already has an active row in this CRM -> skipped, no insert/update call follows
        { data: { id: "existing-2", status: "assigned" }, error: null },
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { assignHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("all_agents", "true");
    const result = await assignHolidayAction("growth", "h1", formData);

    expect(result.assignedCount).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped![0].name).toBe("Agent Two");
    expect(result.skipped![0].reason).toMatch(/already assigned/i);
  });

  it("skips an agent whose insert fails due to an active assignment for the same holiday in the other CRM", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "h1", payment_type: "fixed_amount", amount: 15000, percentage: null, deleted_at: null }, error: null }],
      leadgen_users: [
        { data: [{ id: "agent-3", full_name: "Agent Three", email: "shared.person@example.com" }], error: null },
      ],
      holiday_pay_assignments: [
        { data: null, error: null }, // no existing row for this agent in this CRM
        { data: null, error: { message: "duplicate key value violates unique constraint" } }, // insert hits the cross-CRM partial unique index
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { assignHolidayAction } = await import("@/lib/holiday-pay-actions");

    const formData = new FormData();
    formData.set("all_agents", "true");
    const result = await assignHolidayAction("leadgen", "h1", formData);

    expect(result.assignedCount).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped![0].reason).toMatch(/other CRM/i);
  });

  it("requires at least one selected agent when not assigning to all agents", async () => {
    const mockSupabase = createMockSupabase({
      holidays: [{ data: { id: "h1", payment_type: "unpaid", amount: null, percentage: null, deleted_at: null }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { assignHolidayAction } = await import("@/lib/holiday-pay-actions");

    const result = await assignHolidayAction("growth", "h1", new FormData());
    expect(result.error).toMatch(/select at least one agent/i);
  });
});

describe("loadHolidayPaySummaryAction", () => {
  it("sums each matching assignment's effective_amount for the given agent/payday and requires admin access", async () => {
    const mockSupabase = createMockSupabase({
      holiday_pay_assignments: [
        {
          data: [
            { effective_amount: 7500, holidays: { name: "Labour Day", payment_type: "regular_paid_day" } },
            { effective_amount: 2500, holidays: { name: "Boxing Day", payment_type: "fixed_amount" } },
          ],
          error: null,
        },
      ],
      crm_users: [{ data: { payroll_currency: "NGN" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { loadHolidayPaySummaryAction } = await import("@/lib/holiday-pay-actions");

    const result = await loadHolidayPaySummaryAction("growth", "agent-1", "2026-09-18");
    expect(requireCrmAdminMock).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(10_000);
    expect(result.items).toHaveLength(2);
    expect(result.items?.every((item) => item.currency === "NGN")).toBe(true);
  });

  // The whole point of Payroll Currency (migration 0134): holiday pay is
  // the same raw amount for everyone (no FX conversion), but it must be
  // *shown* in each specific agent's own currency, never a currency tied
  // to the holiday itself (holidays.currency is NGN for every row today).
  it("shows holiday pay in the agent's own Payroll Currency, not NGN, for a PHP-paid agent", async () => {
    const mockSupabase = createMockSupabase({
      holiday_pay_assignments: [
        {
          data: [{ effective_amount: 7500, holidays: { name: "Labour Day", payment_type: "regular_paid_day" } }],
          error: null,
        },
      ],
      leadgen_users: [{ data: { payroll_currency: "PHP" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { loadHolidayPaySummaryAction } = await import("@/lib/holiday-pay-actions");

    const result = await loadHolidayPaySummaryAction("leadgen", "php-agent-1", "2026-09-18");
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(7500);
    expect(result.items).toEqual([
      { holidayName: "Labour Day", paymentType: "regular_paid_day", effectiveAmount: 7500, currency: "PHP" },
    ]);
  });

  it("returns zero holiday pay for an agent who was never assigned to the holiday for that payday", async () => {
    // Agent B (unassigned - e.g. the admin left them out because they
    // were off before the holiday): the query still runs (scoped to this
    // agent's id), it just matches no rows, exactly as it would against a
    // real database with no matching assignment row.
    const mockSupabase = createMockSupabase({
      holiday_pay_assignments: [{ data: [], error: null }],
      leadgen_users: [{ data: { payroll_currency: "NGN" }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { loadHolidayPaySummaryAction } = await import("@/lib/holiday-pay-actions");

    const result = await loadHolidayPaySummaryAction("leadgen", "agent-b-unassigned", "2026-09-18");
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("requires an agent id and a payday", async () => {
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { loadHolidayPaySummaryAction } = await import("@/lib/holiday-pay-actions");

    const result = await loadHolidayPaySummaryAction("growth", "", "2026-09-18");
    expect(result.error).toMatch(/agent and payday are required/i);
  });
});
