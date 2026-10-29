import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  requireLeadgenAdmin: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => ({ rpc: m.rpc, auth: { getUser: m.getUser } }) }));
vi.mock("../leadgen-auth", () => ({ requireLeadgenAdmin: m.requireLeadgenAdmin }));
import {
  approveSalesBonusAction,
  confirmSalesConversionAction,
  markSalesBonusPaidAction,
  recordSalesBonusClientPaymentAction,
  voidSalesBonusAction,
} from "../sales-bonus-actions";

beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "admin" } } });
  m.rpc.mockResolvedValue({ data: {}, error: null });
  m.requireLeadgenAdmin.mockResolvedValue({ id: "admin" });
});

describe("confirmSalesConversionAction", () => {
  it("requires a Lead Gen Admin before touching the database", async () => {
    m.requireLeadgenAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(confirmSalesConversionAction("appt", null)).rejects.toThrow("NEXT_REDIRECT");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("confirms through the database function and refreshes both CRMs' pages", async () => {
    const result = await confirmSalesConversionAction("appt", "  signed  ");
    expect(m.rpc).toHaveBeenCalledWith("winsalot_confirm_sales_conversion", { p_appointment_id: "appt", p_notes: "signed" });
    expect(result.message).toMatch(/pending approval/);
    expect(m.revalidate.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["/leadgen/admin/appointments", "/admin/crm/payroll", "/leadgen/agent/pay", "/agent/pay"]));
  });

  it("surfaces the duplicate-bonus message but hides unexpected database errors", async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "A sales conversion bonus already exists for this sale." } });
    expect(await confirmSalesConversionAction("appt", null)).toEqual({ error: "A sales conversion bonus already exists for this sale." });
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "relation internal detail" } });
    const generic = await confirmSalesConversionAction("appt", null);
    expect(generic.error).not.toContain("internal detail");
    expect(m.revalidate).toHaveBeenCalledTimes(0);
  });

  it("refuses when signed out", async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });
    expect((await confirmSalesConversionAction("appt", null)).error).toBeTruthy();
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("payment actions never mark anything paid on their own", () => {
  it("approve only schedules into a payroll payday", async () => {
    expect((await approveSalesBonusAction("b1", "not-a-date")).error).toBeTruthy();
    expect(m.rpc).not.toHaveBeenCalled();
    await approveSalesBonusAction("b1", "2026-11-06");
    expect(m.rpc).toHaveBeenCalledWith("winsalot_approve_sales_bonus", { p_id: "b1", p_payroll_payday: "2026-11-06" });
    expect(m.rpc).not.toHaveBeenCalledWith("winsalot_mark_sales_bonus_paid", expect.anything());
  });

  it("mark paid needs explicit confirmation, a date and a reference", async () => {
    expect((await markSalesBonusPaidAction("b1", "2026-10-28", "REF", false)).error).toMatch(/Confirm/);
    expect((await markSalesBonusPaidAction("b1", "", "REF", true)).error).toBeTruthy();
    expect(m.rpc).not.toHaveBeenCalled();
    await markSalesBonusPaidAction("b1", "2026-10-28", "REF-1", true);
    expect(m.rpc).toHaveBeenCalledWith("winsalot_mark_sales_bonus_paid", { p_id: "b1", p_payment_date: "2026-10-28", p_payment_reference: "REF-1" });
  });

  it("client payment is recorded without touching the agent payment", async () => {
    const result = await recordSalesBonusClientPaymentAction("b1", "2026-10-28", " EFT ");
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("winsalot_record_sales_bonus_client_payment", { p_id: "b1", p_received_date: "2026-10-28", p_reference: "EFT" });
    expect(result.message).toMatch(/agent's bonus payment status is unchanged/);
  });

  it("void passes the reason through", async () => {
    await voidSalesBonusAction("b1", "customer cancelled");
    expect(m.rpc).toHaveBeenCalledWith("winsalot_void_sales_bonus", { p_id: "b1", p_reason: "customer cancelled" });
  });
});
