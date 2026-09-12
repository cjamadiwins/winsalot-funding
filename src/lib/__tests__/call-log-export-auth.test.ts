import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Confirms the Call Logs CSV export is gated server-side, not just by
// hiding the "Export Call Logs" buttons in the UI - an agent hitting either
// export route directly (typed URL, curl, etc.) must be turned away by
// requireCrmAdmin()/requireLeadgenAdmin() before a single row is queried,
// exactly like every Server Action in this codebase is already tested
// (see holiday-pay-actions.test.ts's "propagates an admin-authorization
// failure without touching the database").

const requireCrmAdminMock = vi.fn();
vi.mock("@/lib/crm-auth", () => ({
  requireCrmAdmin: () => requireCrmAdminMock(),
}));

const requireLeadgenAdminMock = vi.fn();
vi.mock("@/lib/leadgen-auth", () => ({
  requireLeadgenAdmin: () => requireLeadgenAdminMock(),
}));

const fromMock = vi.fn();
const getSupabaseAdminMock = vi.fn(() => ({ from: fromMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

function fakeRequest(url: string): NextRequest {
  // The route only ever reads `request.nextUrl.searchParams` - a plain
  // object with that shape is enough, and avoids depending on
  // NextRequest's own edge-runtime plumbing inside a Node test.
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

// One empty/successful response for every `.from(...)` call an "admin
// allowed" run makes (agent-name lookup, then the batched call-log query
// itself) - enough to let the route run to completion and produce a CSV
// with a header row but no data rows.
function mockEmptyAdminSupabase() {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "gte", "lte", "order", "range"]) {
    chain[method] = vi.fn(() => chain);
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  fromMock.mockReturnValue(chain);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Growth CRM call-log export route", () => {
  it("never touches the database when the caller is not a Growth CRM admin", async () => {
    requireCrmAdminMock.mockRejectedValueOnce(new Error("not an admin"));
    const { GET } = await import("@/app/admin/(dashboard)/crm/performance/call-notes/export/route");

    await expect(GET(fakeRequest("http://localhost/admin/crm/performance/call-notes/export?scope=all"))).rejects.toThrow(
      "not an admin"
    );
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("streams a CSV once requireCrmAdmin confirms an admin", async () => {
    requireCrmAdminMock.mockResolvedValueOnce({ id: "admin-1", role: "admin" });
    mockEmptyAdminSupabase();
    const { GET } = await import("@/app/admin/(dashboard)/crm/performance/call-notes/export/route");

    const response = await GET(fakeRequest("http://localhost/admin/crm/performance/call-notes/export?scope=all"));
    expect(requireCrmAdminMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="Winsalot_Call_Logs_\d{4}-\d{2}-\d{2}\.csv"$/);
  });
});

describe("Lead Generation CRM call-log export route", () => {
  it("never touches the database when the caller is not a Lead Gen admin", async () => {
    requireLeadgenAdminMock.mockRejectedValueOnce(new Error("not an admin"));
    const { GET } = await import("@/app/leadgen/admin/(dashboard)/performance/call-notes/export/route");

    await expect(
      GET(fakeRequest("http://localhost/leadgen/admin/performance/call-notes/export?scope=filtered&agent=agent-1"))
    ).rejects.toThrow("not an admin");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("streams a CSV once requireLeadgenAdmin confirms an admin", async () => {
    requireLeadgenAdminMock.mockResolvedValueOnce({ id: "admin-1", role: "admin" });
    mockEmptyAdminSupabase();
    const { GET } = await import("@/app/leadgen/admin/(dashboard)/performance/call-notes/export/route");

    const response = await GET(fakeRequest("http://localhost/leadgen/admin/performance/call-notes/export?scope=all"));
    expect(requireLeadgenAdminMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="Winsalot_Call_Logs_\d{4}-\d{2}-\d{2}\.csv"$/);
  });
});
