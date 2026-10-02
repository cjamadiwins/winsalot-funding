import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin-only writes for Products, Services & Pricing: the role gate, client
// isolation (an entry can only be changed through its own client), deactivate
// instead of delete, and re-ordering. Every dependency is mocked.

const requireLeadgenAdminMock = vi.fn();
vi.mock("@/lib/leadgen-auth", () => ({ requireLeadgenAdmin: () => requireLeadgenAdminMock() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Response = { data?: unknown; error?: unknown };
type Op = { table: string; calls: [string, unknown[]][] };

function createMockSupabase(responses: Record<string, Response[]>) {
  const queues = Object.fromEntries(Object.entries(responses).map(([t, l]) => [t, [...l]]));
  const ops: Op[] = [];
  const from = vi.fn((table: string) => {
    const response = queues[table]?.shift() ?? { data: null, error: null };
    const resolved = { data: response.data ?? null, error: response.error ?? null };
    const op: Op = { table, calls: [] };
    ops.push(op);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit", "insert", "update", "upsert", "delete"]) {
      chain[method] = vi.fn((...args: unknown[]) => {
        op.calls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolved));
    chain.single = vi.fn(() => Promise.resolve(resolved));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(resolved).then(resolve, reject);
    return chain;
  });
  return { from, ops };
}

let adminDb: ReturnType<typeof createMockSupabase>;
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => adminDb }));

import { moveClientServiceAction, saveClientServiceAction, setClientServiceActiveAction } from "@/app/leadgen/admin/(dashboard)/clients/[id]/services-actions";
import type { ServiceFormInput } from "@/lib/leadgen-client-services";

const form: ServiceFormInput = {
  entry_type: "service",
  name: "Brochure-Style Website",
  description: "",
  pricing_type: "starting_at",
  price_amount: "465",
  currency: "CAD",
  plus_taxes: true,
  price_condition: "",
  included: "Contact form",
  additional_costs: "",
  technical_notes: "",
  sales_notes: "",
  is_active: true,
};

const writes = () => adminDb.ops.flatMap((o) => o.calls.map(([m, a]) => ({ table: o.table, method: m, args: a }))).filter((c) => /^(insert|update|upsert|delete)$/.test(c.method));

beforeEach(() => {
  vi.clearAllMocks();
  requireLeadgenAdminMock.mockResolvedValue({ id: "admin-1", full_name: "Admin", email: "a@w.test" });
});

describe("Admin-only", () => {
  it("rejects a non-admin (agent/client) before touching any data", async () => {
    adminDb = createMockSupabase({});
    requireLeadgenAdminMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveClientServiceAction("hid", null, form)).rejects.toThrow("NEXT_REDIRECT");
    await expect(setClientServiceActiveAction("hid", "s1", false)).rejects.toThrow("NEXT_REDIRECT");
    await expect(moveClientServiceAction("hid", "s1", "up")).rejects.toThrow("NEXT_REDIRECT");
    expect(adminDb.from).not.toHaveBeenCalled();
  });
});

describe("saveClientServiceAction", () => {
  it("adds a service to the given client only, after the last one, stamped with the admin", async () => {
    adminDb = createMockSupabase({
      leadgen_clients: [{ data: { id: "hid" } }],
      leadgen_client_services: [{ data: [{ id: "s1", sort_order: 10, created_at: "x", name: "A" }, { id: "s2", sort_order: 20, created_at: "x", name: "B" }] }, { error: null }],
    });
    const result = await saveClientServiceAction("hid", null, form);
    expect(result).toEqual({ message: "Added." });
    const [insert] = writes();
    expect(insert.table).toBe("leadgen_client_services");
    expect(insert.args[0]).toMatchObject({ client_id: "hid", name: "Brochure-Style Website", pricing_type: "starting_at", price_amount: 465, currency: "CAD", sort_order: 30, created_by: "admin-1", updated_by: "admin-1" });
    expect(writes()).toHaveLength(1);
  });

  it("updates pricing on an entry of this client and records who updated it", async () => {
    adminDb = createMockSupabase({ leadgen_clients: [{ data: { id: "hid" } }], leadgen_client_services: [{ data: { id: "s1" } }, { error: null }] });
    const result = await saveClientServiceAction("hid", "s1", { ...form, price_amount: "499" });
    expect(result).toEqual({ message: "Saved." });
    const [update] = writes();
    expect(update.args[0]).toMatchObject({ price_amount: 499, updated_by: "admin-1" });
    // The update is scoped to BOTH the entry id and the client id.
    const eqs = adminDb.ops.filter((o) => o.table === "leadgen_client_services").at(-1)!.calls.filter(([m]) => m === "eq").map(([, a]) => a);
    expect(eqs).toContainEqual(["id", "s1"]);
    expect(eqs).toContainEqual(["client_id", "hid"]);
  });

  it("refuses to edit an entry through a different client (no write happens)", async () => {
    adminDb = createMockSupabase({ leadgen_clients: [{ data: { id: "tek" } }], leadgen_client_services: [{ data: null }] });
    const result = await saveClientServiceAction("tek", "hidebrandts-service", form);
    expect(result.error).toMatch(/doesn't belong to this client/);
    expect(writes()).toHaveLength(0);
  });

  it("validates input and reports a duplicate name clearly", async () => {
    adminDb = createMockSupabase({});
    expect((await saveClientServiceAction("hid", null, { ...form, name: " " })).error).toMatch(/name is required/);
    expect((await saveClientServiceAction("hid", null, { ...form, price_amount: "x" })).error).toMatch(/price/i);
    adminDb = createMockSupabase({ leadgen_clients: [{ data: { id: "hid" } }], leadgen_client_services: [{ data: [] }, { error: { code: "23505" } }] });
    expect((await saveClientServiceAction("hid", null, form)).error).toMatch(/already has an entry with that name/);
  });

  it("never writes to the client record, leads, appointments or any other table", async () => {
    adminDb = createMockSupabase({ leadgen_clients: [{ data: { id: "hid" } }], leadgen_client_services: [{ data: [] }, { error: null }] });
    await saveClientServiceAction("hid", null, form);
    expect(new Set(writes().map((w) => w.table))).toEqual(new Set(["leadgen_client_services"]));
  });
});

describe("deactivate / reactivate (there is no delete)", () => {
  it("archives within the client and stamps the admin", async () => {
    adminDb = createMockSupabase({ leadgen_client_services: [{ data: { id: "s1" } }, { error: null }] });
    expect(await setClientServiceActiveAction("hid", "s1", false)).toEqual({ message: "Deactivated." });
    expect(writes()[0].args[0]).toMatchObject({ is_active: false, updated_by: "admin-1" });
    expect(writes().every((w) => w.method === "update")).toBe(true);
  });
  it("refuses another client's entry", async () => {
    adminDb = createMockSupabase({ leadgen_client_services: [{ data: null }] });
    expect((await setClientServiceActiveAction("tek", "s1", true)).error).toMatch(/doesn't belong to this client/);
    expect(writes()).toHaveLength(0);
  });
});

describe("moveClientServiceAction", () => {
  const rows = [
    { id: "a", sort_order: 10, created_at: "1", name: "A" },
    { id: "b", sort_order: 20, created_at: "1", name: "B" },
    { id: "c", sort_order: 30, created_at: "1", name: "C" },
  ];
  it("swaps two neighbours within the client", async () => {
    adminDb = createMockSupabase({ leadgen_client_services: [{ data: rows }, { error: null }, { error: null }] });
    await moveClientServiceAction("hid", "b", "up");
    const updates = writes().map((w) => w.args[0] as { sort_order: number });
    expect(updates.map((u) => u.sort_order).sort()).toEqual([10, 20]);
    const byId = adminDb.ops.filter((o) => o.table === "leadgen_client_services" && o.calls.some(([m]) => m === "update")).map((o) => o.calls.find(([m, a]) => m === "eq" && a[0] === "id")![1][1]);
    expect(byId.sort()).toEqual(["a", "b"]);
  });
  it("does nothing at the ends, and rejects an entry that isn't this client's", async () => {
    adminDb = createMockSupabase({ leadgen_client_services: [{ data: rows }] });
    expect(await moveClientServiceAction("hid", "a", "up")).toEqual({});
    expect(writes()).toHaveLength(0);
    adminDb = createMockSupabase({ leadgen_client_services: [{ data: rows }] });
    expect((await moveClientServiceAction("hid", "zzz", "up")).error).toMatch(/doesn't belong/);
  });
});
