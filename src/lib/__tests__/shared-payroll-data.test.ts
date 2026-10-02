import { expect, it, vi } from "vitest";
import { loadSharedPayrollData } from "../shared-payroll-data";
import { AGENT_PAYROLL_COLUMNS } from "../shared-payroll";
import type { createSupabaseServerClient } from "../supabase-server";
type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
it("retrieves long-term history across response pages with stable ordering and session scope", async () => {
 const ranges: number[][] = []; const eq = vi.fn(); const select = vi.fn(); const order = vi.fn();
 const q = { select: (c: string) => { select(c); return q; }, order: (...args: unknown[]) => { order(...args); return q; }, eq: (...args: unknown[]) => { eq(...args); return q; }, range: async (start: number, end: number) => { ranges.push([start,end]); return { data: Array.from({length: start < 1000 ? 500 : 7},(_, i) => ({id:start+i})),error:null }; } };
 const db = { from: () => q } as unknown as Client;
 const result = await loadSharedPayrollData(db, "winsalot_payroll", AGENT_PAYROLL_COLUMNS, "own-agent");
 expect(result.error).toBeNull(); expect(result.data).toHaveLength(1007); expect(ranges).toEqual([[0,499],[500,999],[1000,1499]]);
 expect(eq).toHaveBeenCalledWith("agent_id", "own-agent"); expect(select).toHaveBeenCalledWith(AGENT_PAYROLL_COLUMNS); expect(order).toHaveBeenCalledWith("id");
});
it("reports a history-page error instead of showing a partial history as complete", async () => {
 const q = { select: () => q, order: () => q, range: async () => ({data:null,error:{message:"Read denied"}}) };
 expect(await loadSharedPayrollData({from:()=>q} as unknown as Client, "winsalot_payroll_audit_log")).toEqual({data:null,error:{message:"Read denied"}});
});
