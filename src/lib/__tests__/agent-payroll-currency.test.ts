import { beforeEach, describe, expect, it, vi } from "vitest";

// Covers the admin-controlled Payroll Currency field on each agent's
// profile (migration 0134): updateAgentAction (Growth CRM, crm_users) and
// updateLeadgenUserAction (Lead Generation CRM, leadgen_users) must both
// validate and persist payroll_currency, never trusting an arbitrary
// string. Every dependency is mocked so this exercises each action's own
// logic without a live Supabase connection.

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

function createUpdateOnlyMock() {
  const updateMock = vi.fn(() => chain);
  const eqMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const chain = { update: updateMock, eq: eqMock };
  const from = vi.fn(() => chain);
  return { from, updateMock, eqMock };
}

const growthAdmin = { id: "admin-1", full_name: "Growth Admin", email: "growth-admin@winsalotcorp.com" };
const leadgenAdmin = { id: "ladmin-1", full_name: "Leadgen Admin", email: "leadgen-admin@winsalotcorp.com" };

beforeEach(() => {
  vi.clearAllMocks();
  requireCrmAdminMock.mockResolvedValue(growthAdmin);
  requireLeadgenAdminMock.mockResolvedValue(leadgenAdmin);
});

describe("updateAgentAction (Growth CRM): payroll_currency", () => {
  it("saves a valid payroll_currency onto crm_users", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateAgentAction } = await import("@/app/admin/(dashboard)/crm/agents/actions");

    const formData = new FormData();
    formData.set("full_name", "Test Agent");
    formData.set("role", "agent");
    formData.set("active", "on");
    formData.set("payroll_currency", "PHP");

    const result = await updateAgentAction("agent-1", formData);
    expect(result.error).toBeUndefined();
    expect(mockSupabase.from).toHaveBeenCalledWith("crm_users");
    expect(mockSupabase.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ payroll_currency: "PHP" })
    );
  });

  it("rejects an invalid currency instead of writing it", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateAgentAction } = await import("@/app/admin/(dashboard)/crm/agents/actions");

    const formData = new FormData();
    formData.set("full_name", "Test Agent");
    formData.set("role", "agent");
    formData.set("payroll_currency", "EUR");

    const result = await updateAgentAction("agent-1", formData);
    expect(result.error).toMatch(/invalid payroll currency/i);
    expect(mockSupabase.updateMock).not.toHaveBeenCalled();
  });
});

describe("updateLeadgenUserAction (Lead Generation CRM): payroll_currency", () => {
  it("saves a valid payroll_currency onto leadgen_users", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateLeadgenUserAction } = await import("@/app/leadgen/admin/(dashboard)/actions");

    const formData = new FormData();
    formData.set("full_name", "Test Agent");
    formData.set("active", "on");
    formData.set("payroll_currency", "CAD");

    const result = await updateLeadgenUserAction("agent-2", formData);
    expect(result.error).toBeUndefined();
    expect(mockSupabase.from).toHaveBeenCalledWith("leadgen_users");
    expect(mockSupabase.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ payroll_currency: "CAD" })
    );
  });

  it("rejects an invalid currency instead of writing it", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateLeadgenUserAction } = await import("@/app/leadgen/admin/(dashboard)/actions");

    const formData = new FormData();
    formData.set("full_name", "Test Agent");
    formData.set("active", "on");
    formData.set("payroll_currency", "GBP");

    const result = await updateLeadgenUserAction("agent-2", formData);
    expect(result.error).toMatch(/invalid payroll currency/i);
    expect(mockSupabase.updateMock).not.toHaveBeenCalled();
  });
});
