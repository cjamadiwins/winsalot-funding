import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Covers markModuleOpenedAction/markModuleCompleteAction (src/lib/crm-
// training-actions.ts), shared by both the agent's own Training
// dashboard and an admin's "view as a learner" experience. Every
// dependency is mocked so this exercises the actions' own logic in
// isolation - no live Supabase connection, no Next.js request context.

const requireCrmUserMock = vi.fn();
vi.mock("@/lib/crm-auth", () => ({
  requireCrmUser: () => requireCrmUserMock(),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const createSupabaseServerClientMock = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

/** A chainable stub: any method call (eq/select/insert/update/delete/...)
 * returns the same stub; maybeSingle()/single() (or awaiting the stub
 * directly) resolves to `result`. Models exactly enough of the Supabase
 * query builder for these tests. */
function stub(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const promise = Promise.resolve(result);
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "maybeSingle" || prop === "single") return () => promise;
      return () => proxy;
    },
  });
  return proxy;
}

function mockFromQueue(results: Array<{ data?: unknown; error?: unknown }>) {
  const from = vi.fn();
  for (const r of results) from.mockImplementationOnce(() => stub(r));
  return { from };
}

const USER = { id: "user-1", full_name: "Test User", email: "user@example.com", role: "agent" as const, active: true };

describe("markModuleOpenedAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCrmUserMock.mockResolvedValue(USER);
  });

  it("creates a progress row for the module's current version when none exists yet", async () => {
    const mockSupabase = mockFromQueue([
      { data: { id: "mod-1", current_version: 1 } }, // modules select
      { data: null }, // progress select -> not opened yet
      { error: null }, // progress insert
    ]);
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { markModuleOpenedAction } = await import("../crm-training-actions");

    const result = await markModuleOpenedAction("mod-1");
    expect(result).toEqual({});
    expect(mockSupabase.from).toHaveBeenCalledTimes(3);
    expect(mockSupabase.from).toHaveBeenNthCalledWith(3, "crm_training_progress");
  });

  it("does not insert again when a progress row for the current version already exists", async () => {
    const mockSupabase = mockFromQueue([
      { data: { id: "mod-1", current_version: 1 } },
      { data: { id: "progress-1" } }, // already opened
    ]);
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { markModuleOpenedAction } = await import("../crm-training-actions");

    const result = await markModuleOpenedAction("mod-1");
    expect(result).toEqual({});
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });

  it("errors when the module does not exist", async () => {
    const mockSupabase = mockFromQueue([{ data: null }]);
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { markModuleOpenedAction } = await import("../crm-training-actions");

    const result = await markModuleOpenedAction("missing");
    expect(result.error).toBeTruthy();
  });
});

describe("markModuleCompleteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCrmUserMock.mockResolvedValue(USER);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // "A user must open a module before marking it complete."
  it("refuses to complete a module that was never opened", async () => {
    const mockSupabase = mockFromQueue([
      { data: { id: "mod-1", current_version: 1 } }, // modules select
      { data: null }, // progress select -> never opened
    ]);
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { markModuleCompleteAction } = await import("../crm-training-actions");

    const result = await markModuleCompleteAction("mod-1");
    expect(result.error).toMatch(/open this module/i);
  });

  it("marks an opened module complete", async () => {
    const mockSupabase = mockFromQueue([
      { data: { id: "mod-1", current_version: 1 } },
      { data: { id: "progress-1", completed_at: null } }, // opened, not completed
      { error: null }, // update
    ]);
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { markModuleCompleteAction } = await import("../crm-training-actions");

    const result = await markModuleCompleteAction("mod-1");
    expect(result).toEqual({});
    expect(mockSupabase.from).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/agent/winsalot-training");
  });

  it("is a no-op (not an error) when the module is already completed", async () => {
    const mockSupabase = mockFromQueue([
      { data: { id: "mod-1", current_version: 1 } },
      { data: { id: "progress-1", completed_at: "2026-01-01T00:00:00Z" } },
    ]);
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { markModuleCompleteAction } = await import("../crm-training-actions");

    const result = await markModuleCompleteAction("mod-1");
    expect(result).toEqual({});
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });
});
