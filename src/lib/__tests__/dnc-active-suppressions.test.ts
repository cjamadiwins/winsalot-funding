import { describe, expect, it, vi } from "vitest";

// getActiveDncSuppressions is what populates the agent-facing Do Not
// Contact dashboard card/modal (Item 3: "Agents CAN view active
// restrictions") - a dedicated file so @/lib/supabase-admin can be mocked
// cleanly at the top level without interacting with the broader
// dnc-suppression mock used by dnc-agent-permissions.test.ts.

const eqMock = vi.fn();
const orderMock = vi.fn();
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

describe("getActiveDncSuppressions", () => {
  it("only queries active-status rows from the shared suppression table", async () => {
    eqMock.mockReturnValue({ order: orderMock });
    orderMock.mockResolvedValue({ data: [{ id: "s1", status: "active" }] });

    const { getActiveDncSuppressions } = await import("@/lib/dnc-suppression");
    const rows = await getActiveDncSuppressions();

    expect(fromMock).toHaveBeenCalledWith("crm_dnc_suppressions");
    expect(eqMock).toHaveBeenCalledWith("status", "active");
    expect(rows).toEqual([{ id: "s1", status: "active" }]);
  });
});
