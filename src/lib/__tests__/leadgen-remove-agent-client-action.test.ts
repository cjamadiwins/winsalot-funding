import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/leadgen-auth", () => ({ requireLeadgenAdmin: async () => ({ id: "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));
vi.mock("@/lib/leadgen-agent-active-client", () => ({ listSelectableActiveClients: async () => [], assignmentWouldRestrictAgent: () => false }));
vi.mock("@/lib/leadgen-campaign-assignment", () => ({ ensureRestrictedAgentOnCampaign: async () => {} }));

import { previewRemoveAgentClientAction, removeAgentClientAction } from "@/app/leadgen/admin/(dashboard)/assignments/actions";

const AGENT = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

beforeEach(() => rpc.mockReset());

describe("removeAgentClientAction (single atomic database call)", () => {
  it("sends the reassignment choice in one rpc and reports lists moved", async () => {
    rpc.mockResolvedValue({ data: { listsAffected: 2 }, error: null });
    const result = await removeAgentClientAction(AGENT, CLIENT, { lists: "reassign", reassignTo: OTHER, primary: "set", newPrimaryClientId: OTHER });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("leadgen_remove_agent_client", expect.objectContaining({ p_agent_id: AGENT, p_client_id: CLIENT, p_list_mode: "reassign", p_reassign_to: OTHER, p_primary_action: "set", p_dry_run: false }));
    expect(result).toEqual({ removedFromLists: 2 });
  });

  it("never auto-picks a Primary or list handling when none is given", async () => {
    rpc.mockResolvedValue({ data: { listsAffected: 0 }, error: null });
    await removeAgentClientAction(AGENT, CLIENT);
    expect(rpc).toHaveBeenCalledWith("leadgen_remove_agent_client", expect.objectContaining({ p_list_mode: "none", p_primary_action: "keep", p_reassign_to: null }));
  });

  it("surfaces a database failure as a clear 'nothing was changed' error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await removeAgentClientAction(AGENT, CLIENT, { lists: "unassign" });
    expect(result.error).toBe("Nothing was changed. boom");
  });

  it("rejects malformed ids without calling the database", async () => {
    expect((await removeAgentClientAction("nope", CLIENT)).error).toBe("Invalid request.");
    expect((await removeAgentClientAction(AGENT, CLIENT, { reassignTo: "bad" })).error).toBe("Invalid request.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preview is a dry run", async () => {
    rpc.mockResolvedValue({ data: { activeLists: [] }, error: null });
    await previewRemoveAgentClientAction(AGENT, CLIENT);
    expect(rpc).toHaveBeenCalledWith("leadgen_remove_agent_client", { p_agent_id: AGENT, p_client_id: CLIENT, p_dry_run: true });
  });
});
