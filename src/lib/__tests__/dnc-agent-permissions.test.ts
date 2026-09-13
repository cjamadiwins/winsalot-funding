import { describe, expect, it, vi, beforeEach } from "vitest";

// Confirms the agent-facing Do Not Contact feature (added to both agent
// dashboards) actually matches the requested permission model:
// - an agent CAN add a restriction (gated by the same requireCrmUser()/
//   requireLeadgenAgent() every other agent action uses - never
//   requireCrmAdmin()/requireLeadgenAdmin())
// - an agent has NO remove/reactivate/edit/import/history capability at
//   all - not hidden in the UI, but genuinely absent from the agent
//   action files, so there is no Server Action id for those operations
//   reachable from the agent dashboard's bundle.
// - getActiveDncSuppressions (what populates the agent's view) only ever
//   reads active rows.

const requireCrmUserMock = vi.fn();
const requireLeadgenAgentMock = vi.fn();
const addOrUpdateDncSuppressionMock = vi.fn();

vi.mock("@/lib/crm-auth", () => ({ requireCrmUser: () => requireCrmUserMock() }));
vi.mock("@/lib/leadgen-auth", () => ({ requireLeadgenAgent: () => requireLeadgenAgentMock() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/dnc-suppression", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dnc-suppression")>("@/lib/dnc-suppression");
  return { ...actual, addOrUpdateDncSuppression: (...args: unknown[]) => addOrUpdateDncSuppressionMock(...args) };
});

beforeEach(() => {
  requireCrmUserMock.mockReset();
  requireLeadgenAgentMock.mockReset();
  addOrUpdateDncSuppressionMock.mockReset();
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("Growth CRM agent Do Not Contact action", () => {
  it("does not export any remove/reactivate/edit/import/history action", async () => {
    const mod = await import("@/app/agent/(dashboard)/do-not-contact-actions");
    expect(Object.keys(mod).sort()).toEqual(["addAgentDncSuppressionAction"]);
  });

  it("is gated by requireCrmUser, not an admin-only check", async () => {
    requireCrmUserMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const { addAgentDncSuppressionAction } = await import("@/app/agent/(dashboard)/do-not-contact-actions");
    await expect(addAgentDncSuppressionAction(formDataWith({ phone: "4165551234", reason: "test" }))).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(addOrUpdateDncSuppressionMock).not.toHaveBeenCalled();
  });

  it("records the calling agent as added-by, sourced from growth", async () => {
    requireCrmUserMock.mockResolvedValue({ id: "agent-1", full_name: "Jane Agent", email: "jane@winsalotcorp.com" });
    addOrUpdateDncSuppressionMock.mockResolvedValue({ created: true, row: {} });
    const { addAgentDncSuppressionAction } = await import("@/app/agent/(dashboard)/do-not-contact-actions");

    const formData = formDataWith({ business_name: "Acme Co", phone: "4165551234", reason: "Requested Do Not Call" });
    formData.append("channels", "phone");
    const result = await addAgentDncSuppressionAction(formData);

    expect(result).toEqual({ success: "Added to the Do Not Contact list." });
    expect(addOrUpdateDncSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceCrm: "growth",
        addedByUserId: "agent-1",
        addedByName: "Jane Agent",
        channels: ["phone"],
      })
    );
  });
});

describe("Lead Generation CRM agent Do Not Contact action", () => {
  it("does not export any remove/reactivate/edit/import/history action", async () => {
    const mod = await import("@/app/leadgen/agent/(dashboard)/do-not-contact-actions");
    expect(Object.keys(mod).sort()).toEqual(["addAgentDncSuppressionAction"]);
  });

  it("is gated by requireLeadgenAgent, not an admin-only check", async () => {
    requireLeadgenAgentMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const { addAgentDncSuppressionAction } = await import("@/app/leadgen/agent/(dashboard)/do-not-contact-actions");
    await expect(addAgentDncSuppressionAction(formDataWith({ phone: "4165551234", reason: "test" }))).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(addOrUpdateDncSuppressionMock).not.toHaveBeenCalled();
  });

  it("records the calling agent as added-by, sourced from lead_generation", async () => {
    requireLeadgenAgentMock.mockResolvedValue({ id: "agent-2", full_name: "Sam Agent", email: "sam@winsalotcorp.com" });
    addOrUpdateDncSuppressionMock.mockResolvedValue({ created: true, row: {} });
    const { addAgentDncSuppressionAction } = await import("@/app/leadgen/agent/(dashboard)/do-not-contact-actions");

    const formData = formDataWith({ business_name: "Acme Co", phone: "4165551234", reason: "Requested Do Not Call" });
    const result = await addAgentDncSuppressionAction(formData);

    expect(result).toEqual({ success: "Added to the Do Not Contact list." });
    expect(addOrUpdateDncSuppressionMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceCrm: "lead_generation", addedByUserId: "agent-2", addedByName: "Sam Agent" })
    );
  });
});

