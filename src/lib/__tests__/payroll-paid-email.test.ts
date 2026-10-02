import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayrollRecord } from "../payroll";
const mocks = vi.hoisted(() => ({ from: vi.fn(), send: vi.fn() }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock("../resend", () => ({ getResendClient: () => ({ emails: { send: mocks.send } }) }));
vi.mock("../leadgen-email", () => ({ getLeadgenSenderEmail: () => "Winsalot Corp. <info@winsalotcorp.com>", getLeadgenReplyToEmail: () => "info@winsalotcorp.com" }));
import { buildPayrollPaidEmail, sendPayrollPaidEmail } from "../payroll-paid-email";
const record = { id: "pay1", agent_id: "agent1", status: "paid", payday: "2026-10-02", pay_period_start: "2026-09-19", pay_period_end: "2026-10-02", actual_payment_date: "2026-10-02", payment_method: "Bank Transfer", base_pay_earned: 50000, bonus_commission: 10000, internet_allowance: 25000, deductions: 0, other_additions: 0, holiday_pay: 0, total_pay: 85000, admin_notes: "Thanks <Henry>\nSecond line", reopen_reason: "SECRET internal adjustment", reopened_at: null } as PayrollRecord;
const actor = { id: "admin", full_name: "Admin", email: "admin@example.com" };
let claimed: Set<string>;
let updates: Record<string, unknown>[];
let historyCount: number;
let claimFailure: boolean;
let missingAgent: boolean;
beforeEach(() => {
  vi.clearAllMocks(); claimed = new Set(); updates = []; historyCount = 1; claimFailure = false; missingAgent = false;
  mocks.send.mockResolvedValue({ data: { id: "re_123" }, error: null });
  mocks.from.mockImplementation((table: string) => {
    let op = ""; let payload: Record<string, unknown>;
    let claimKey = "";
    const q: Record<string, unknown> = {};
    q.insert = (value: Record<string, unknown>) => { op = "insert"; claimKey = `${value.agent_id}/${value.pay_period_start}/${value.pay_period_end}`; return q; };
    q.update = (value: typeof payload) => { op = "update"; payload = value; return q; };
    q.select = () => q; q.eq = () => q;
    const result = () => {
      if (table.endsWith("_users")) return { data: missingAgent ? null : { full_name: "Henry", email: "agent@example.com", payroll_currency: "NGN" }, error: null };
      if (op === "insert") {
        if (claimFailure) return { data: null, error: { message: "audit unavailable" } };
        if (claimed.has(claimKey)) return { data: null, error: { code: "23505" } };
        claimed.add(claimKey); return { data: { id: "audit1" }, error: null };
      }
      if (op === "update") { updates.push(payload); return { error: null }; }
      return { count: historyCount, error: null };
    };
    q.single = async () => result();
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return q;
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe("payroll paid notification", () => {
  it("includes final stored totals, period, method, additions and agent notes; excludes internal reasons", () => {
    const message = buildPayrollPaidEmail(record, "Henry", "NGN", "leadgen");
    expect(message.text).toContain("85,000");
    for (const label of ["Pay period", "Payment date", "Payment method", "Incentive / bonus", "Internet allowance", "Deductions", "Notes for agent"]) expect(message.text).toContain(label);
    expect(message.text).toContain("Thanks <Henry>");
    expect(message.html).toContain("Thanks &lt;Henry&gt;");
    expect(message.html).not.toContain("SECRET");
    expect(message.text).toContain("https://leads.winsalotcorp.com/leadgen/agent/pay");
    expect(message.text).toContain("Print / Save as PDF");
    expect(buildPayrollPaidEmail(record, "Henry", "NGN", "growth").text).toContain("https://growth.winsalotcorp.com/agent/pay");
  });
  it("does not send for unpaid records", async () => {
    await sendPayrollPaidEmail("growth", { ...record, status: "approved" }, actor);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["growth", "leadgen"] as const)("sends through existing infrastructure and logs provider acceptance in %s", async (crm) => {
    await sendPayrollPaidEmail(crm, record, actor);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "agent@example.com", from: expect.stringContaining("Winsalot Corp.") }), { idempotencyKey: `winsalot-payroll/agent1/2026-09-19/2026-10-02` });
    expect(updates.at(-1)).toMatchObject({ status: "sent", resend_email_id: "re_123", to_email: "agent@example.com" });
  });
  it("claims once across concurrent and repeated saves", async () => {
    await Promise.all([sendPayrollPaidEmail("leadgen", record, actor), sendPayrollPaidEmail("leadgen", record, actor)]);
    await sendPayrollPaidEmail("leadgen", record, actor);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("uses one central claim for different CRM records in the same period", async () => {
    await Promise.all([
      sendPayrollPaidEmail("growth", record, actor),
      sendPayrollPaidEmail("leadgen", { ...record, id: "other-source-record" }, actor),
    ]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("payroll_email_notifications");
  });
  it("allows a different pay period its own shared notification", async () => {
    await sendPayrollPaidEmail("growth", record, actor);
    await sendPayrollPaidEmail("leadgen", { ...record, id: "next", pay_period_start: "2026-10-03", pay_period_end: "2026-10-16" }, actor);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it("never sends without a durable audit claim", async () => {
    claimFailure = true; await sendPayrollPaidEmail("growth", record, actor);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("logs explicit provider rejection without undoing payroll", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: "Rejected" } });
    await expect(sendPayrollPaidEmail("growth", record, actor)).resolves.toBeUndefined();
    expect(updates.at(-1)).toMatchObject({ status: "failed", error: "Rejected" });
    await sendPayrollPaidEmail("growth", record, actor); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("marks ambiguous provider failures unknown and does not blindly retry", async () => {
    mocks.send.mockRejectedValue(new Error("Timeout")); await sendPayrollPaidEmail("growth", record, actor);
    expect(updates.at(-1)).toMatchObject({ status: "unknown", error: "Timeout" });
  });
  it("logs missing agent email without sending", async () => {
    missingAgent = true; await sendPayrollPaidEmail("growth", record, actor);
    expect(mocks.send).not.toHaveBeenCalled(); expect(updates.at(-1)?.status).toBe("failed");
  });
  it("suppresses historic records repaid after reopening", async () => {
    historyCount = 2; await sendPayrollPaidEmail("growth", record, actor);
    expect(mocks.send).not.toHaveBeenCalled(); expect(updates.at(-1)?.status).toBe("suppressed");
  });
  it("suppresses reopened records even if prior audit entry was absent", async () => {
    await sendPayrollPaidEmail("growth", { ...record, reopened_at: "2026-10-02" }, actor);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
