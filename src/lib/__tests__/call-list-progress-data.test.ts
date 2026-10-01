import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { countSegmentCalls, loadCallListProgress } from "@/lib/call-list-progress-data";

// Exercise the real Supabase request builder against a deterministic REST
// transport. These tests do not insert fixtures into the production database.
function client(fetcher: typeof fetch) {
  return createClient("https://example.supabase.co", "test-key", { global: { fetch: fetcher }, auth: { persistSession: false } });
}

describe("server progress queries", () => {
  it.each(["growth", "lead_generation"] as const)("counts 451 calls using HEAD and exact count for %s", async (crm) => {
    const db = client(async (input, init) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe(`/rest/v1/${crm === "growth" ? "crm_call_logs" : "leadgen_call_logs"}`);
      expect(url.searchParams.get("call_list_segment_id")).toBe("eq.assigned-list");
      expect(url.searchParams.has("limit")).toBe(false);
      expect(init?.method).toBe("HEAD");
      expect(new Headers(init?.headers).get("prefer")).toContain("count=exact");
      return new Response(null, { headers: { "content-range": "*/451" } });
    });
    expect(await countSegmentCalls(db, crm, "assigned-list")).toBe(451);
  });

  it("pages beyond 1000 active leads and only requests caller-authorized segment IDs", async () => {
    let requests = 0;
    const db = client(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("segment_id")).toBe("in.(assigned-list)");
      expect(url.searchParams.get("removed_at")).toBe("is.null");
      expect(url.searchParams.get("order")).toBe("id.asc");
      const offset = Number(url.searchParams.get("offset"));
      expect(offset).toBe(requests++ * 1000);
      const size = offset === 0 ? 1000 : 205;
      const rows = Array.from({ length: size }, (_, i) => ({ id: `${offset + i}`, segment_id: "assigned-list", last_outcome: "Interested", last_contacted_at: null, callback_at: null, removed_at: null }));
      return Response.json(rows);
    });
    const progress = await loadCallListProgress(db, ["assigned-list"]);
    expect(requests).toBe(2);
    expect([...progress.keys()]).toEqual(["assigned-list"]);
    expect(progress.get("assigned-list")).toMatchObject({ totalLeads: 1205, workedLeads: 1205, interested: 1205, progressPercent: 100 });
  });

  it("does not present partial or zero progress when the database query fails", async () => {
    const db = client(async () => Response.json({ message: "permission denied", code: "42501" }, { status: 403 }));
    await expect(loadCallListProgress(db, ["assigned-list"])).rejects.toThrow("permission denied");
    await expect(countSegmentCalls(db, "growth", "assigned-list")).rejects.toThrow("permission denied");
  });
});
