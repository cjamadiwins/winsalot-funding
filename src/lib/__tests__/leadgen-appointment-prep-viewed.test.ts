import { describe, expect, it, vi } from "vitest";
import { markBriefViewed } from "../leadgen-appointment-prep-data";

function fakeAdmin(rows: unknown[]) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["update", "eq", "select"]) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    });
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return { admin: { from: vi.fn(() => chain) } as never, calls };
}

describe("markBriefViewed", () => {
  it("flips only a SENT brief belonging to this client and appointment", async () => {
    const { admin, calls } = fakeAdmin([{ appointment_id: "a1" }]);
    const viewedAt = await markBriefViewed(admin, { appointmentId: "a1", clientId: "c1" });
    expect(viewedAt).toEqual(expect.any(String));
    const update = calls.find(([m]) => m === "update")![1][0] as Record<string, unknown>;
    expect(update).toMatchObject({ prep_status: "client_viewed", viewed_at: viewedAt });
    const filters = calls.filter(([m]) => m === "eq").map(([, a]) => a);
    expect(filters).toEqual([
      ["appointment_id", "a1"],
      ["client_id", "c1"],
      ["prep_status", "sent_to_client"],
    ]);
  });

  it("reports no change when nothing matched (draft, already viewed, or not theirs)", async () => {
    const { admin } = fakeAdmin([]);
    expect(await markBriefViewed(admin, { appointmentId: "a1", clientId: "c1" })).toBeNull();
  });
});
