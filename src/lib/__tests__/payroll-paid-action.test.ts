import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ send: vi.fn(), from: vi.fn(), revalidate: vi.fn(), authorize: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => ({ from: m.from }) }));
vi.mock("../crm-auth", () => ({ requireCrmAdmin: m.authorize }));
vi.mock("../leadgen-auth", () => ({ requireLeadgenAdmin: m.authorize }));
vi.mock("../payroll-paid-email", () => ({ sendPayrollPaidEmail: m.send }));
import { markPayrollPaidAction } from "../../app/admin/(dashboard)/crm/payroll/actions";
import { markLeadgenPayrollPaidAction } from "../../app/leadgen/admin/(dashboard)/payroll/actions";
let status: string; let updateError: boolean; let lostRace: boolean;
let predicates: [string, unknown][];
beforeEach(() => {
 vi.clearAllMocks(); status = "approved"; updateError = false; lostRace = false; predicates = [];
 m.authorize.mockResolvedValue({ id: "admin", full_name: "Admin", email: "admin@example.com" });
 m.from.mockImplementation(() => {
  let update = false;
  const q = { select: () => q, eq: (key: string, value: unknown) => { if(update) predicates.push([key,value]); return q; }, update: () => { update = true; return q; }, single: async () => ({ data: { agent_id: "agent1", status }, error: null }), maybeSingle: async () => ({ data: lostRace || updateError ? null : { id: "pay1", agent_id: "agent1", status: "paid" }, error: updateError ? { message: "Denied" } : null }), insert: async () => ({ error: null }) };
  return q;
 });
});
const form = () => { const f = new FormData(); f.set("actual_payment_date","2026-10-02"); f.set("payment_method","Bank Transfer"); return f; };
for (const [crm,action] of [["growth",markPayrollPaidAction],["leadgen",markLeadgenPayrollPaidAction]] as const) {
 it(`${crm}: sends only after successful Paid transition`, async () => {
  expect(await action("pay1",form())).toEqual({});
  expect(predicates).toContainEqual(["status","approved"]);
  expect(m.send).toHaveBeenCalledWith(crm,expect.objectContaining({status:"paid"}),expect.objectContaining({id:"admin"}));
 });
 it(`${crm}: repeated Paid save sends nothing`, async () => { status="paid"; expect((await action("pay1",form())).error).toBeTruthy(); expect(m.send).not.toHaveBeenCalled(); });
 it(`${crm}: failed update sends nothing`, async () => { updateError=true; expect((await action("pay1",form())).error).toBeTruthy(); expect(m.send).not.toHaveBeenCalled(); });
 it(`${crm}: lost concurrent transition sends nothing`, async () => { lostRace=true; expect((await action("pay1",form())).error).toBeTruthy(); expect(m.send).not.toHaveBeenCalled(); });
 it(`${crm}: requires payment metadata`, async () => { expect((await action("pay1",new FormData())).error).toBeTruthy(); expect(m.send).not.toHaveBeenCalled(); });
}
