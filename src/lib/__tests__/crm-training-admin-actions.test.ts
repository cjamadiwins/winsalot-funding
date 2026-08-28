import { beforeEach, describe, expect, it, vi } from "vitest";

// Covers the admin-only Winsalot Training management actions
// (src/app/admin/(dashboard)/crm/winsalot-training/actions.ts): module
// creation, the minor-edit-vs-major-revision versioning behavior (the
// core "preserve completion history" requirement), reordering,
// activate/deactivate, required/optional, and progress reset. Every
// dependency is mocked so this exercises the actions' own logic in
// isolation.

const requireCrmAdminMock = vi.fn();
vi.mock("@/lib/crm-auth", () => ({
  requireCrmAdmin: () => requireCrmAdminMock(),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const createSupabaseServerClientMock = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

type Call = { table: string; method: string; args: unknown[] };

/** Every chain method (select/eq/insert/update/delete/order/limit/in) is
 * recorded and returns the same stub; maybeSingle()/single() (or
 * awaiting the stub directly) resolves to the next queued result for
 * that table. */
function createSupabaseMock(tableResults: Record<string, Array<{ data?: unknown; error?: unknown; count?: number }>>) {
  const queues = new Map(Object.entries(tableResults).map(([k, v]) => [k, [...v]]));
  const calls: Call[] = [];

  function stubFor(table: string) {
    const queue = queues.get(table);
    const result = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    const promise = Promise.resolve(result);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return promise.then.bind(promise);
          if (prop === "catch") return promise.catch.bind(promise);
          if (prop === "maybeSingle" || prop === "single") return () => promise;
          return (...args: unknown[]) => {
            calls.push({ table, method: String(prop), args });
            return proxy;
          };
        },
      }
    );
    return proxy;
  }

  const from = vi.fn((table: string) => stubFor(table));
  return { from, calls };
}

function findCall(calls: Call[], table: string, method: string) {
  return calls.find((c) => c.table === table && c.method === method);
}

const ADMIN = { id: "admin-1", full_name: "Admin User", email: "admin@example.com", role: "admin" as const, active: true };

function moduleFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("title", overrides.title ?? "Welcome to Winsalot Corp.");
  fd.set("learningObjective", overrides.learningObjective ?? "Understand the company.");
  fd.set("explanation", overrides.explanation ?? "Winsalot Corp. is Canadian.");
  fd.set("summary", overrides.summary ?? "A short summary.");
  fd.set("steps", overrides.steps ?? "Step one\nStep two");
  if ("is_required" in overrides) fd.set("is_required", overrides.is_required);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCrmAdminMock.mockResolvedValue(ADMIN);
});

describe("createTrainingModuleAction", () => {
  it("requires admin authorization", async () => {
    requireCrmAdminMock.mockRejectedValueOnce(new Error("not an admin"));
    const mockSupabase = createSupabaseMock({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createTrainingModuleAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    await expect(createTrainingModuleAction(moduleFormData())).rejects.toThrow("not an admin");
  });

  it("creates the module, its version 1 content, and assigns it to the agent role", async () => {
    const mockSupabase = createSupabaseMock({
      crm_training_modules: [{ data: { sort_order: 5 } }, { count: 0 }, { data: { id: "mod-new", title: "Welcome to Winsalot Corp." } }],
      crm_training_module_versions: [{ error: null }],
      crm_training_module_assignments: [{ error: null }],
      crm_training_admin_actions: [{ error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { createTrainingModuleAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await createTrainingModuleAction(moduleFormData({ is_required: "on" }));
    expect(result.error).toBeUndefined();
    expect(result.moduleId).toBe("mod-new");

    const versionInsert = findCall(mockSupabase.calls, "crm_training_module_versions", "insert");
    expect((versionInsert!.args[0] as { version: number }).version).toBe(1);

    const assignmentInsert = findCall(mockSupabase.calls, "crm_training_module_assignments", "insert");
    expect((assignmentInsert!.args[0] as { assigned_role: string }).assigned_role).toBe("agent");

    expect(findCall(mockSupabase.calls, "crm_training_admin_actions", "insert")).toBeTruthy();
  });
});

describe("updateTrainingModuleAction - versioning behavior", () => {
  // "Editing a module must not silently erase historical completion
  // records" - a minor edit must never touch current_version.
  it("a minor edit updates the existing version's content without bumping current_version", async () => {
    const mockSupabase = createSupabaseMock({
      crm_training_modules: [{ data: { id: "mod-1", current_version: 2 } }, { error: null }],
      crm_training_module_versions: [{ error: null }],
      crm_training_admin_actions: [{ error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateTrainingModuleAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await updateTrainingModuleAction("mod-1", moduleFormData(), false);
    expect(result.error).toBeUndefined();

    const versionUpdate = findCall(mockSupabase.calls, "crm_training_module_versions", "update");
    expect(versionUpdate).toBeTruthy();
    // The minor-edit path never inserts a new version row.
    expect(findCall(mockSupabase.calls, "crm_training_module_versions", "insert")).toBeUndefined();

    const moduleUpdate = findCall(mockSupabase.calls, "crm_training_modules", "update");
    expect((moduleUpdate!.args[0] as { current_version?: number }).current_version).toBeUndefined();
  });

  // "If an administrator makes a major revision, provide an option to
  // require users to complete the revised version again" - a major
  // revision inserts a brand-new version row and bumps current_version;
  // the old version row (and anyone's completion against it) is never
  // touched by this action.
  it("a major revision inserts a new version row and bumps current_version", async () => {
    const mockSupabase = createSupabaseMock({
      crm_training_modules: [{ data: { id: "mod-1", current_version: 2 } }, { error: null }],
      crm_training_module_versions: [{ error: null }],
      crm_training_admin_actions: [{ error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateTrainingModuleAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await updateTrainingModuleAction("mod-1", moduleFormData(), true);
    expect(result.error).toBeUndefined();

    const versionInsert = findCall(mockSupabase.calls, "crm_training_module_versions", "insert");
    expect(versionInsert).toBeTruthy();
    expect((versionInsert!.args[0] as { version: number }).version).toBe(3);
    // The major-revision path never updates the old version's content in place.
    expect(findCall(mockSupabase.calls, "crm_training_module_versions", "update")).toBeUndefined();

    const moduleUpdate = findCall(mockSupabase.calls, "crm_training_modules", "update");
    expect((moduleUpdate!.args[0] as { current_version: number }).current_version).toBe(3);
  });

  it("requires admin authorization", async () => {
    requireCrmAdminMock.mockRejectedValueOnce(new Error("not an admin"));
    const mockSupabase = createSupabaseMock({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateTrainingModuleAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    await expect(updateTrainingModuleAction("mod-1", moduleFormData(), false)).rejects.toThrow("not an admin");
  });
});

describe("reorderTrainingModulesAction", () => {
  it("writes sort_order to match the given order, in sequence", async () => {
    const mockSupabase = createSupabaseMock({
      crm_training_modules: [{ error: null }, { error: null }, { error: null }],
      crm_training_admin_actions: [{ error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { reorderTrainingModulesAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await reorderTrainingModulesAction(["c", "a", "b"]);
    expect(result.error).toBeUndefined();

    const updates = mockSupabase.calls.filter((c) => c.table === "crm_training_modules" && c.method === "update");
    expect(updates.map((u) => (u.args[0] as { sort_order: number }).sort_order)).toEqual([1, 2, 3]);
  });
});

describe("setModuleActiveAction / setModuleRequiredAction", () => {
  it("activates a module and logs the admin action", async () => {
    const mockSupabase = createSupabaseMock({
      crm_training_modules: [{ data: { id: "mod-1", title: "Welcome to Winsalot Corp." } }],
      crm_training_admin_actions: [{ error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { setModuleActiveAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await setModuleActiveAction("mod-1", true);
    expect(result.error).toBeUndefined();
    const action = findCall(mockSupabase.calls, "crm_training_admin_actions", "insert");
    expect((action!.args[0] as { action: string }).action).toBe("module_activated");
  });

  it("marks a module optional and logs the admin action", async () => {
    const mockSupabase = createSupabaseMock({
      crm_training_modules: [{ data: { id: "mod-1", title: "Welcome to Winsalot Corp." } }],
      crm_training_admin_actions: [{ error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { setModuleRequiredAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await setModuleRequiredAction("mod-1", false);
    expect(result.error).toBeUndefined();
    const action = findCall(mockSupabase.calls, "crm_training_admin_actions", "insert");
    expect((action!.args[0] as { action: string }).action).toBe("module_required_changed");
  });
});

describe("resetAgentModuleProgressAction", () => {
  it("requires admin authorization", async () => {
    requireCrmAdminMock.mockRejectedValueOnce(new Error("not an admin"));
    const mockSupabase = createSupabaseMock({});
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { resetAgentModuleProgressAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    await expect(resetAgentModuleProgressAction("agent-1", "mod-1")).rejects.toThrow("not an admin");
  });

  it("deletes the agent's progress row for the module's current version and logs the reset", async () => {
    const mockSupabase = createSupabaseMock({
      crm_users: [{ data: { id: "agent-1", full_name: "Jane Agent", email: "jane@example.com" } }],
      crm_training_modules: [{ data: { id: "mod-1", title: "Welcome to Winsalot Corp.", current_version: 2 } }],
      crm_training_progress: [{ error: null }],
      crm_training_admin_actions: [{ error: null }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { resetAgentModuleProgressAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await resetAgentModuleProgressAction("agent-1", "mod-1");
    expect(result.error).toBeUndefined();

    const del = findCall(mockSupabase.calls, "crm_training_progress", "delete");
    expect(del).toBeTruthy();

    const auditInsert = findCall(mockSupabase.calls, "crm_training_admin_actions", "insert");
    const payload = auditInsert!.args[0] as { action: string; target_user_id: string };
    expect(payload.action).toBe("progress_reset");
    expect(payload.target_user_id).toBe("agent-1");
  });

  it("errors when the target agent does not exist", async () => {
    const mockSupabase = createSupabaseMock({
      crm_users: [{ data: null }],
      crm_training_modules: [{ data: { id: "mod-1", title: "x", current_version: 1 } }],
    });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { resetAgentModuleProgressAction } = await import("@/app/admin/(dashboard)/crm/winsalot-training/actions");

    const result = await resetAgentModuleProgressAction("missing-agent", "mod-1");
    expect(result.error).toBeTruthy();
  });
});
