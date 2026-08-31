import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Covers the fix for "Closed opportunities cannot be deleted": an admin
// must be able to permanently delete an opportunity regardless of stage
// (Open, Won/"Client Won", Lost/"Not Interested", or any other closed
// stage). Every dependency of the actions module is mocked so this
// exercises deleteOpportunityAction's own logic in isolation, without
// needing a live Supabase connection or a Next.js request context.

const requireCrmAdminMock = vi.fn();
vi.mock("@/lib/crm-auth", () => ({
  requireCrmAdmin: () => requireCrmAdminMock(),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
}));

// deleteOpportunityAction redirects after deleting (see its own comment
// for why: without it, Next.js re-renders the caller's now-deleted detail
// page as part of the action's response). redirect() throws in real Next.js
// - mocked as a no-op here, matching how the real one behaves from this
// function's own point of view (nothing after the call ever runs).
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

// deleteOpportunityAction never touches these, but they're imported
// elsewhere in the same actions module - mocked so importing the module
// under test never pulls in their real (env/Resend-dependent) code.
vi.mock("@/lib/close-opportunity", () => ({ closeOpportunity: vi.fn() }));
vi.mock("@/lib/send-prospect-email", () => ({ sendProspectEmail: vi.fn() }));
vi.mock("@/lib/winsalot-consultation-book", () => ({
  getWinsalotOfferedSlots: vi.fn(),
  performWinsalotBooking: vi.fn(),
}));

const createSupabaseServerClientMock = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

function createMockSupabase() {
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const deleteFn = vi.fn(() => ({ eq: deleteEq }));
  const from = vi.fn(() => ({ delete: deleteFn }));
  return { from, deleteFn, deleteEq };
}

describe("deleteOpportunityAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCrmAdminMock.mockResolvedValue({ id: "admin-1", full_name: "Admin", email: "admin@example.com", role: "admin" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it.each(["New Prospect", "Contacted", "Interested", "Consultation Booked", "Proposal or Application Sent", "Follow-Up Required"])(
    "deletes an Open-stage opportunity (%s) without throwing",
    async () => {
      const mockSupabase = createMockSupabase();
      createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
      const { deleteOpportunityAction } = await import("@/app/admin/(dashboard)/crm/opportunities/[id]/actions");

      await expect(deleteOpportunityAction("opp-open-id")).resolves.toBeUndefined();

      expect(requireCrmAdminMock).toHaveBeenCalledTimes(1);
      expect(mockSupabase.from).toHaveBeenCalledWith("crm_opportunities");
      expect(mockSupabase.deleteEq).toHaveBeenCalledWith("id", "opp-open-id");
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin/crm");
      expect(redirectMock).toHaveBeenCalledWith("/admin/crm?deleted=opportunity");
      expect(revalidatePathMock.mock.invocationCallOrder[0]).toBeLessThan(redirectMock.mock.invocationCallOrder[0]);
    }
  );

  it.each(["Client Won", "Not Interested"])("deletes a Closed-stage opportunity (%s) without throwing", async () => {
    const mockSupabase = createMockSupabase();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { deleteOpportunityAction } = await import("@/app/admin/(dashboard)/crm/opportunities/[id]/actions");

    await expect(deleteOpportunityAction("opp-closed-id")).resolves.toBeUndefined();

    expect(requireCrmAdminMock).toHaveBeenCalledTimes(1);
    expect(mockSupabase.from).toHaveBeenCalledWith("crm_opportunities");
    expect(mockSupabase.deleteEq).toHaveBeenCalledWith("id", "opp-closed-id");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/crm");
    expect(redirectMock).toHaveBeenCalledWith("/admin/crm?deleted=opportunity");
  });

  it("requires admin authorization before deleting (permission stays admin-only)", async () => {
    const mockSupabase = createMockSupabase();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    requireCrmAdminMock.mockRejectedValueOnce(new Error("not an admin"));
    const { deleteOpportunityAction } = await import("@/app/admin/(dashboard)/crm/opportunities/[id]/actions");

    await expect(deleteOpportunityAction("opp-any-id")).rejects.toThrow("not an admin");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("surfaces a clear error if the delete itself fails, for either an open or closed record", async () => {
    const mockSupabase = createMockSupabase();
    mockSupabase.deleteEq.mockResolvedValueOnce({ error: { message: "db error" } });
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { deleteOpportunityAction } = await import("@/app/admin/(dashboard)/crm/opportunities/[id]/actions");

    await expect(deleteOpportunityAction("opp-id")).rejects.toThrow("Failed to delete the opportunity.");
  });
});

// Structural regression guard, same technique as
// crm-invoice-agent-permissions.test.ts: reads the actual migration/
// source text so a future edit that quietly reintroduces the
// closed-stage delete block (in the database or in the action) fails
// this test immediately.
describe("closed-stage opportunity deletion is not blocked", () => {
  const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const allMigrationSql = migrationFiles.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");

  const actionsSource = fs.readFileSync(
    path.resolve(__dirname, "../../app/admin/(dashboard)/crm/opportunities/[id]/actions.ts"),
    "utf8"
  );

  it("the database no longer has a trigger blocking delete of a closed opportunity", () => {
    expect(allMigrationSql).toContain("drop trigger if exists crm_opportunities_prevent_closed_delete_trigger");
  });

  it("deleteOpportunityAction no longer rejects a closed stage before deleting", () => {
    const fnStart = actionsSource.indexOf("export async function deleteOpportunityAction");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = actionsSource.slice(fnStart, actionsSource.indexOf("\n}", fnStart));
    expect(fnBody).not.toContain("CLOSED_STAGES");
    expect(fnBody).not.toContain("cannot be deleted");
  });

  it("deleteOpportunityAction still requires admin authorization", () => {
    const fnStart = actionsSource.indexOf("export async function deleteOpportunityAction");
    const fnBody = actionsSource.slice(fnStart, actionsSource.indexOf("\n}", fnStart));
    expect(fnBody).toContain("requireCrmAdmin()");
  });
});
