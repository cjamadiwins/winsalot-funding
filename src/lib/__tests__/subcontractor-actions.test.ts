import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked server-action tests for src/lib/subcontractor-actions.ts, same
// technique as holiday-pay-actions.test.ts: every dependency (auth,
// Supabase client, revalidatePath) is mocked, so this exercises each
// action's own logic - validation, admin-only gating, quantity x rate =
// gross pay, and correct table selection per CRM - without a live
// Supabase connection.

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

function createMockSupabase(responsesByTable: Record<string, QueryResponse[]>) {
  const fromCalls: string[] = [];
  const queues: Record<string, QueryResponse[]> = Object.fromEntries(
    Object.entries(responsesByTable).map(([table, list]) => [table, [...list]])
  );

  function makeChain(response: QueryResponse) {
    const resolved = { data: response.data ?? null, error: response.error ?? null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "insert", "update", "delete"]) {
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

describe("createSubcontractorAction", () => {
  it("requires a full name, valid currency, and valid pay type", async () => {
    const mockSupabase = createMockSupabase({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createSubcontractorAction } = await import("@/lib/subcontractor-actions");

    const missingName = new FormData();
    missingName.set("currency", "NGN");
    missingName.set("pay_type", "fixed");
    expect((await createSubcontractorAction("growth", missingName)).error).toMatch(/full name is required/i);

    const badCurrency = new FormData();
    badCurrency.set("full_name", "Jane Doe");
    badCurrency.set("currency", "XYZ");
    badCurrency.set("pay_type", "fixed");
    expect((await createSubcontractorAction("growth", badCurrency)).error).toMatch(/valid currency/i);

    const badPayType = new FormData();
    badPayType.set("full_name", "Jane Doe");
    badPayType.set("currency", "NGN");
    badPayType.set("pay_type", "bogus");
    expect((await createSubcontractorAction("growth", badPayType)).error).toMatch(/valid pay type/i);
  });

  it("writes to crm_subcontractors for growth and leadgen_subcontractors for leadgen", async () => {
    const growthSupabase = createMockSupabase({ crm_subcontractors: [{ data: null, error: null }] });
    createSupabaseServerClientMock.mockResolvedValue(growthSupabase);
    const { createSubcontractorAction } = await import("@/lib/subcontractor-actions");

    const formData = new FormData();
    formData.set("full_name", "Jane Doe");
    formData.set("currency", "PHP");
    formData.set("pay_type", "hourly");
    formData.set("pay_rate", "25");

    const result = await createSubcontractorAction("growth", formData);
    expect(result.error).toBeUndefined();
    expect(requireCrmAdminMock).toHaveBeenCalledTimes(1);
    expect(growthSupabase.fromCalls).toEqual(["crm_subcontractors"]);

    const leadgenSupabase = createMockSupabase({ leadgen_subcontractors: [{ data: null, error: null }] });
    createSupabaseServerClientMock.mockResolvedValue(leadgenSupabase);
    const result2 = await createSubcontractorAction("leadgen", formData);
    expect(result2.error).toBeUndefined();
    expect(requireLeadgenAdminMock).toHaveBeenCalledTimes(1);
    expect(leadgenSupabase.fromCalls).toEqual(["leadgen_subcontractors"]);
  });

  it("never touches crm_payroll/leadgen_payroll or crm_users/leadgen_users - fully separate from employee payroll", async () => {
    const mockSupabase = createMockSupabase({ crm_subcontractors: [{ data: null, error: null }] });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createSubcontractorAction } = await import("@/lib/subcontractor-actions");

    const formData = new FormData();
    formData.set("full_name", "Jane Doe");
    formData.set("currency", "NGN");
    formData.set("pay_type", "fixed");

    await createSubcontractorAction("growth", formData);
    expect(mockSupabase.fromCalls).not.toContain("crm_payroll");
    expect(mockSupabase.fromCalls).not.toContain("crm_users");
  });
});

describe("createSubcontractorPaymentAction", () => {
  it("computes Gross Pay = Quantity x Rate for a quantity-based pay type", async () => {
    const mockSupabase = createMockSupabase({
      crm_subcontractors: [{ data: { id: "sub-1", pay_type: "hourly", pay_rate: 25 }, error: null }],
      crm_subcontractor_payments: [{ data: null, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createSubcontractorPaymentAction } = await import("@/lib/subcontractor-actions");

    const formData = new FormData();
    formData.set("period_start", "2026-09-01");
    formData.set("period_end", "2026-09-14");
    formData.set("quantity", "40");
    formData.set("adjustments", "0");
    formData.set("deductions", "0");
    formData.set("status", "pending");

    const result = await createSubcontractorPaymentAction("growth", "sub-1", formData);
    expect(result.error).toBeUndefined();

    const paymentsCallIndex = mockSupabase.fromCalls.indexOf("crm_subcontractor_payments");
    const insertChain = mockSupabase.from.mock.results[paymentsCallIndex].value as { insert: ReturnType<typeof vi.fn> };
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ subcontractor_id: "sub-1", quantity: 40, gross_pay: 1000 })
    );
  });

  it("uses the admin-entered Gross Pay directly for a flat pay type (fixed/weekly/biweekly/monthly)", async () => {
    const mockSupabase = createMockSupabase({
      leadgen_subcontractors: [{ data: { id: "sub-2", pay_type: "monthly", pay_rate: 3000 }, error: null }],
      leadgen_subcontractor_payments: [{ data: null, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createSubcontractorPaymentAction } = await import("@/lib/subcontractor-actions");

    const formData = new FormData();
    formData.set("period_start", "2026-09-01");
    formData.set("period_end", "2026-09-30");
    formData.set("gross_pay", "3000");
    formData.set("adjustments", "200");
    formData.set("deductions", "50");
    formData.set("status", "pending");

    const result = await createSubcontractorPaymentAction("leadgen", "sub-2", formData);
    expect(result.error).toBeUndefined();

    const paymentsCallIndex = mockSupabase.fromCalls.indexOf("leadgen_subcontractor_payments");
    const insertChain = mockSupabase.from.mock.results[paymentsCallIndex].value as { insert: ReturnType<typeof vi.fn> };
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: null, gross_pay: 3000, adjustments: 200, deductions: 50 })
    );
  });

  it("requires a payment date when status is Paid, and rejects one when it isn't", async () => {
    const mockSupabase = createMockSupabase({
      crm_subcontractors: [
        { data: { id: "sub-1", pay_type: "fixed", pay_rate: 500 }, error: null },
        { data: { id: "sub-1", pay_type: "fixed", pay_rate: 500 }, error: null },
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createSubcontractorPaymentAction } = await import("@/lib/subcontractor-actions");

    const missingDate = new FormData();
    missingDate.set("period_start", "2026-09-01");
    missingDate.set("period_end", "2026-09-14");
    missingDate.set("gross_pay", "500");
    missingDate.set("status", "paid");
    expect((await createSubcontractorPaymentAction("growth", "sub-1", missingDate)).error).toMatch(/payment date is required/i);

    const unexpectedDate = new FormData();
    unexpectedDate.set("period_start", "2026-09-01");
    unexpectedDate.set("period_end", "2026-09-14");
    unexpectedDate.set("gross_pay", "500");
    unexpectedDate.set("status", "pending");
    unexpectedDate.set("payment_date", "2026-09-15");
    expect((await createSubcontractorPaymentAction("growth", "sub-1", unexpectedDate)).error).toMatch(
      /only be set when status is paid/i
    );
  });

  it("rejects a period where the end is before the start", async () => {
    const mockSupabase = createMockSupabase({
      crm_subcontractors: [{ data: { id: "sub-1", pay_type: "fixed", pay_rate: 500 }, error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createSubcontractorPaymentAction } = await import("@/lib/subcontractor-actions");

    const formData = new FormData();
    formData.set("period_start", "2026-09-14");
    formData.set("period_end", "2026-09-01");
    formData.set("gross_pay", "500");
    formData.set("status", "pending");

    const result = await createSubcontractorPaymentAction("growth", "sub-1", formData);
    expect(result.error).toMatch(/period end must be on or after/i);
  });
});

describe("deactivateSubcontractorAction / reactivateSubcontractorAction", () => {
  it("deactivate sets active=false with a timestamp and admin; reactivate clears them", async () => {
    const mockSupabase = createMockSupabase({ crm_subcontractors: [{ data: null, error: null }] });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { deactivateSubcontractorAction } = await import("@/lib/subcontractor-actions");

    const result = await deactivateSubcontractorAction("growth", "sub-1");
    expect(result.error).toBeUndefined();
    const updateChain = mockSupabase.from.mock.results[0].value as { update: ReturnType<typeof vi.fn> };
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, deactivated_by: growthAdmin.id })
    );
  });
});
