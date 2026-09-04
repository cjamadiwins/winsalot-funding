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
    formData.set("payroll_currency", "JPY");

    const result = await updateAgentAction("agent-1", formData);
    expect(result.error).toMatch(/invalid payroll currency/i);
    expect(mockSupabase.updateMock).not.toHaveBeenCalled();
  });

  it("accepts one of the newly added currencies (GHS) same as any other", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateAgentAction } = await import("@/app/admin/(dashboard)/crm/agents/actions");

    const formData = new FormData();
    formData.set("full_name", "Test Agent");
    formData.set("role", "agent");
    formData.set("active", "on");
    formData.set("payroll_currency", "GHS");

    const result = await updateAgentAction("agent-1", formData);
    expect(result.error).toBeUndefined();
    expect(mockSupabase.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ payroll_currency: "GHS" })
    );
  });

  it("changing one agent's currency does not touch any other agent's row", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateAgentAction } = await import("@/app/admin/(dashboard)/crm/agents/actions");

    const formData = new FormData();
    formData.set("full_name", "Test Agent");
    formData.set("role", "agent");
    formData.set("active", "on");
    formData.set("payroll_currency", "USD");

    await updateAgentAction("agent-only-this-one", formData);
    expect(mockSupabase.eqMock).toHaveBeenCalledWith("id", "agent-only-this-one");
    expect(mockSupabase.eqMock).toHaveBeenCalledTimes(1);
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
    formData.set("payroll_currency", "JPY");

    const result = await updateLeadgenUserAction("agent-2", formData);
    expect(result.error).toMatch(/invalid payroll currency/i);
    expect(mockSupabase.updateMock).not.toHaveBeenCalled();
  });
});

// Covers the Pay Currency selector added directly to the Payroll page's
// "Pay structure (advanced)" section (src/components/payroll/
// AdminPayrollClient.tsx) - a single-field currency update the admin can
// trigger without leaving the Payroll page, separate from the full-profile
// updateAgentAction/updateLeadgenUserAction above.
describe("updatePayrollAgentCurrencyAction (Growth CRM payroll page)", () => {
  it("saves a valid currency onto exactly the one targeted agent's crm_users row", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updatePayrollAgentCurrencyAction } = await import("@/app/admin/(dashboard)/crm/payroll/actions");

    const result = await updatePayrollAgentCurrencyAction("agent-1", "PHP");
    expect(result.error).toBeUndefined();
    expect(mockSupabase.from).toHaveBeenCalledWith("crm_users");
    expect(mockSupabase.updateMock).toHaveBeenCalledWith({ payroll_currency: "PHP" });
    expect(mockSupabase.eqMock).toHaveBeenCalledWith("id", "agent-1");
  });

  it("accepts a newly added currency (INR)", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updatePayrollAgentCurrencyAction } = await import("@/app/admin/(dashboard)/crm/payroll/actions");

    const result = await updatePayrollAgentCurrencyAction("agent-1", "INR");
    expect(result.error).toBeUndefined();
    expect(mockSupabase.updateMock).toHaveBeenCalledWith({ payroll_currency: "INR" });
  });

  it("rejects an invalid currency and never calls update", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updatePayrollAgentCurrencyAction } = await import("@/app/admin/(dashboard)/crm/payroll/actions");

    const result = await updatePayrollAgentCurrencyAction("agent-1", "JPY");
    expect(result.error).toMatch(/invalid payroll currency/i);
    expect(mockSupabase.updateMock).not.toHaveBeenCalled();
  });

  it("changing one agent's currency never touches another agent's row", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updatePayrollAgentCurrencyAction } = await import("@/app/admin/(dashboard)/crm/payroll/actions");

    await updatePayrollAgentCurrencyAction("agent-only-this-one", "CAD");
    expect(mockSupabase.eqMock).toHaveBeenCalledWith("id", "agent-only-this-one");
    expect(mockSupabase.eqMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateLeadgenPayrollAgentCurrencyAction (Lead Generation CRM payroll page)", () => {
  it("saves a valid currency onto exactly the one targeted agent's leadgen_users row", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateLeadgenPayrollAgentCurrencyAction } = await import("@/app/leadgen/admin/(dashboard)/payroll/actions");

    const result = await updateLeadgenPayrollAgentCurrencyAction("agent-2", "USD");
    expect(result.error).toBeUndefined();
    expect(mockSupabase.from).toHaveBeenCalledWith("leadgen_users");
    expect(mockSupabase.updateMock).toHaveBeenCalledWith({ payroll_currency: "USD" });
    expect(mockSupabase.eqMock).toHaveBeenCalledWith("id", "agent-2");
  });

  it("accepts a newly added currency (KES)", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateLeadgenPayrollAgentCurrencyAction } = await import("@/app/leadgen/admin/(dashboard)/payroll/actions");

    const result = await updateLeadgenPayrollAgentCurrencyAction("agent-2", "KES");
    expect(result.error).toBeUndefined();
    expect(mockSupabase.updateMock).toHaveBeenCalledWith({ payroll_currency: "KES" });
  });

  it("rejects an invalid currency and never calls update", async () => {
    const mockSupabase = createUpdateOnlyMock();
    createSupabaseServerClientMock.mockResolvedValue(mockSupabase);
    const { updateLeadgenPayrollAgentCurrencyAction } = await import("@/app/leadgen/admin/(dashboard)/payroll/actions");

    const result = await updateLeadgenPayrollAgentCurrencyAction("agent-2", "JPY");
    expect(result.error).toMatch(/invalid payroll currency/i);
    expect(mockSupabase.updateMock).not.toHaveBeenCalled();
  });
});
