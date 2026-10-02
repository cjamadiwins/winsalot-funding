import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), paidGrowth: vi.fn(), paidLeadgen: vi.fn(), revalidate: vi.fn(), createGrowth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => ({ from: m.from, auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) } }) }));
vi.mock("../../app/admin/(dashboard)/crm/payroll/actions", () => ({ markPayrollPaidAction: m.paidGrowth, createPayrollAction: m.createGrowth }));
vi.mock("../../app/leadgen/admin/(dashboard)/payroll/actions", () => ({ markLeadgenPayrollPaidAction: m.paidLeadgen }));
vi.mock("../../app/admin/(dashboard)/crm/payroll/holiday-actions", () => ({ loadHolidayPaySummaryAction: vi.fn() }));
vi.mock("../../app/leadgen/admin/(dashboard)/payroll/holiday-actions", () => ({ loadHolidayPaySummaryAction: vi.fn() }));
import { markPayrollPaidAction, createPayrollAction } from "../shared-payroll-actions";
let source: string | null; let adminAllowed: boolean;
beforeEach(() => {
 vi.clearAllMocks(); source = "leadgen"; adminAllowed = true;
 m.paidGrowth.mockResolvedValue({}); m.paidLeadgen.mockResolvedValue({}); m.createGrowth.mockResolvedValue({});
 m.from.mockImplementation((table: string) => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table.endsWith("_users") ? (adminAllowed ? { id: "admin" } : null) : source ? { source_crm: source } : null, error: null }) }; return q; });
});
it("routes by persisted provenance despite submitted CRM flags", async () => {
 const form = new FormData(); form.set("source_crm", "growth");
 expect(await markPayrollPaidAction("record", form)).toEqual({}); expect(m.paidLeadgen).toHaveBeenCalledWith("record", form); expect(m.paidGrowth).not.toHaveBeenCalled();
 expect(m.revalidate.mock.calls.map(c => c[0])).toEqual(["/admin/crm/payroll", "/leadgen/admin/payroll", "/agent/pay", "/leadgen/agent/pay"]);
});
it("keeps existing source write permissions", async () => { adminAllowed = false; expect((await markPayrollPaidAction("record", new FormData())).error).toBeTruthy(); expect(m.paidLeadgen).not.toHaveBeenCalled(); });
it("does not act on inaccessible or ambiguous records", async () => { source = null; expect((await markPayrollPaidAction("record", new FormData())).error).toBeTruthy(); expect(m.paidLeadgen).not.toHaveBeenCalled(); });
it("failed existing workflow is reported without refreshing or sending a second notification", async () => { m.paidLeadgen.mockResolvedValue({ error: "Paid update failed" }); expect(await markPayrollPaidAction("record", new FormData())).toEqual({ error: "Paid update failed" }); expect(m.revalidate).not.toHaveBeenCalled(); });
it("creates in one existing store from the shared identity", async () => { source = "growth"; const form = new FormData(); form.set("agent_id", "agent"); expect(await createPayrollAction(form)).toEqual({}); expect(m.createGrowth).toHaveBeenCalledOnce(); });
