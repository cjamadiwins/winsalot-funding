import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
function table(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    maybeSingle: async () => ({ data: (db[name] ?? []).find((r) => filters.every((f) => f(r))) ?? null, error: null }),
  };
  return b;
}
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => table(t) }) }));

import { assertProductionCampaign, friendlyTestClientError, isTestOnlyCampaign, TEST_CLIENT_LIST_MESSAGE } from "@/lib/leadgen-test-client-guard";
import { saveLeadgenSegmentAssignment } from "@/lib/call-list-assignment";
import type { CallListSegmentRow } from "@/lib/call-list-types";

beforeEach(() => {
  db.leadgen_clients = [{ id: "test", is_internal_test: true, active: true }, { id: "tek", is_internal_test: false, active: true }];
  db.leadgen_campaigns = [{ id: "c-test", client_id: "test" }, { id: "c-tek", client_id: "tek" }];
});

describe("test-only client guard (flag-based, never name-based)", () => {
  it("flags campaigns by the client's is_internal_test, not its name", async () => {
    expect(await isTestOnlyCampaign("c-test")).toBe(true);
    expect(await isTestOnlyCampaign("c-tek")).toBe(false);
    expect(await isTestOnlyCampaign("missing")).toBe(false);
    db.leadgen_clients.find((c) => c.id === "tek")!.name = "Winsalot Corp. Test";
    expect(await isTestOnlyCampaign("c-tek")).toBe(false); // a name alone never matters
  });

  it("assertProductionCampaign rejects test-only and allows real clients", async () => {
    await expect(assertProductionCampaign("c-test")).rejects.toThrow(TEST_CLIENT_LIST_MESSAGE);
    await expect(assertProductionCampaign("c-tek")).resolves.toBeUndefined();
  });

  it("maps the database trigger's message to the friendly one", () => {
    expect(friendlyTestClientError("Winsalot Corp. Test is a test-only client and cannot own production call lists.")).toBe(TEST_CLIENT_LIST_MESSAGE);
    expect(friendlyTestClientError("some other error")).toBeNull();
  });

  it("Save Assignment refuses a test-only client before writing anything", async () => {
    const segment = { id: "s1", crm: "lead_generation", leadgen_campaign_id: "c-tek", growth_opportunity_type: null } as CallListSegmentRow;
    await expect(saveLeadgenSegmentAssignment(segment, "c-test", [])).rejects.toThrow(TEST_CLIENT_LIST_MESSAGE);
  });
});
