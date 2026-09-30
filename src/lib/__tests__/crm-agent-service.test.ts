import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowedOpportunityTypes, isAgentService, serviceAllowsOpportunityType, AGENT_SERVICE_LABELS } from "@/lib/crm-agent-service-shared";

describe("agent service assignment rules", () => {
  it("Lead Generation only sees lead_generation records", () => {
    expect(serviceAllowsOpportunityType("lead_generation", "lead_generation")).toBe(true);
    expect(serviceAllowsOpportunityType("lead_generation", "business_financing")).toBe(false);
    expect(serviceAllowsOpportunityType("lead_generation", "both_services")).toBe(false);
    expect(allowedOpportunityTypes("lead_generation")).toEqual(["lead_generation"]);
  });

  it("Business Finance only sees business_financing records", () => {
    expect(serviceAllowsOpportunityType("business_financing", "business_financing")).toBe(true);
    expect(serviceAllowsOpportunityType("business_financing", "lead_generation")).toBe(false);
    expect(serviceAllowsOpportunityType("business_financing", "both_services")).toBe(false);
    expect(allowedOpportunityTypes("business_financing")).toEqual(["business_financing"]);
  });

  it("Both sees every service, including both_services records", () => {
    for (const type of ["lead_generation", "business_financing", "both_services"]) expect(serviceAllowsOpportunityType("both", type)).toBe(true);
    expect(allowedOpportunityTypes("both")).toHaveLength(3);
  });

  it("no assignment means no Growth service", () => {
    expect(serviceAllowsOpportunityType(null, "lead_generation")).toBe(false);
    expect(allowedOpportunityTypes(null)).toEqual([]);
  });

  it("validates assignment values and labels them for Admin", () => {
    expect(isAgentService("both")).toBe(true);
    expect(isAgentService("cleaning")).toBe(false);
    expect(AGENT_SERVICE_LABELS.business_financing).toBe("Business Finance");
  });
});

const upsert = vi.fn();
let role = "admin";
let targetRole = "agent";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/crm-auth", () => ({
  requireCrmAdmin: async () => {
    if (role !== "admin") throw new Error("redirect");
    return { id: "admin-1" };
  },
}));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) =>
      table === "crm_users"
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "a1", role: targetRole } }) }) }) }
        : { upsert },
  }),
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/site-url", () => ({ getAuthRedirectBaseUrl: () => "" }));
vi.mock("@/lib/crm-training-data", () => ({ fetchActiveAssignedModules: vi.fn(), fetchOwnProgressByModuleId: vi.fn() }));
vi.mock("@/lib/crm-training-types", () => ({ isModuleCompletedForUser: vi.fn() }));

describe("setAgentServiceAction is Admin-only", () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ error: null });
    role = "admin";
    targetRole = "agent";
  });

  it("an admin saves the assignment", async () => {
    const { setAgentServiceAction } = await import("@/app/admin/(dashboard)/crm/agents/actions");
    expect(await setAgentServiceAction("a1", "business_financing")).toEqual({});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ agent_id: "a1", service: "business_financing", assigned_by: "admin-1" }), { onConflict: "agent_id" });
  });

  it("a non-admin is stopped by the auth gate before anything is written", async () => {
    role = "agent";
    const { setAgentServiceAction } = await import("@/app/admin/(dashboard)/crm/agents/actions");
    await expect(setAgentServiceAction("a1", "both")).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects unknown services and non-agent targets", async () => {
    const { setAgentServiceAction } = await import("@/app/admin/(dashboard)/crm/agents/actions");
    expect((await setAgentServiceAction("a1", "cleaning")).error).toBeTruthy();
    targetRole = "admin";
    expect((await setAgentServiceAction("a1", "both")).error).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });
});
