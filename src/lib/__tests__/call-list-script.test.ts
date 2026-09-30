import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeScriptText, resolveGrowthScriptKey, substituteAgentName, isValidGrowthScriptKey } from "@/lib/call-list-script-shared";
import { buildLeadgenCallScript } from "@/lib/leadgen-call-script";

const updates: Record<string, unknown>[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ update: (patch: Record<string, unknown>) => (updates.push(patch), { eq: async () => ({ error: null }) }) }) }),
}));
import { saveSegmentScript } from "@/lib/call-list-script";
import type { CallListSegmentRow } from "@/lib/call-list-types";

const seg = (over: Partial<CallListSegmentRow>) => ({ id: "s1", crm: "growth", call_script_key: null, call_script_text: null, growth_opportunity_type: "lead_generation", ...over }) as CallListSegmentRow;

describe("Growth script resolution", () => {
  it("uses the list's template, else Business Finance's own script, else nothing", () => {
    expect(resolveGrowthScriptKey({ call_script_key: "website-development", growth_opportunity_type: "lead_generation" })).toBe("website-development");
    expect(resolveGrowthScriptKey({ call_script_key: null, growth_opportunity_type: "business_financing" })).toBe("business-finance");
    expect(resolveGrowthScriptKey({ call_script_key: null, growth_opportunity_type: "lead_generation" })).toBeNull();
    expect(resolveGrowthScriptKey({ call_script_key: "bogus", growth_opportunity_type: "lead_generation" })).toBeNull();
  });
  it("normalises text, validates keys and fills the agent's name", () => {
    expect(normalizeScriptText("  hi  ")).toBe("hi");
    expect(normalizeScriptText("   ")).toBeNull();
    expect(isValidGrowthScriptKey("it-services")).toBe(true);
    expect(isValidGrowthScriptKey("nope")).toBe(false);
    expect(substituteAgentName("Hi, I'm [Agent Name].", "Henry")).toBe("Hi, I'm Henry.");
  });
});

describe("Lead Gen list script override", () => {
  const client = { name: "Teknokraft", call_script_value_proposition: null, call_script_services: null, call_script_closing: null, call_script_notes: null, call_script_override: null };
  it("a per-list custom script replaces the client's, with placeholders filled", () => {
    const built = buildLeadgenCallScript({ agentName: "Henry", prospectBusinessName: "Pet Palace", client: { ...client, call_script_override: "Hello [Prospect Business Name], it's [Agent Name] for [Client Business Name]." } });
    expect(built.isCustomOverride).toBe(true);
    expect(built.fullText).toBe("Hello Pet Palace, it's Henry for Teknokraft.");
  });
  it("without an override the client's built-in script is used", () => {
    expect(buildLeadgenCallScript({ agentName: "Henry", client }).isCustomOverride).toBe(false);
  });
});

describe("saveSegmentScript writes only the script columns", () => {
  beforeEach(() => { updates.length = 0; });
  it("Growth: saves template + text", async () => {
    await saveSegmentScript(seg({}), { key: "website-development", text: " Hi " });
    expect(updates).toEqual([{ call_script_key: "website-development", call_script_text: "Hi" }]);
  });
  it("Growth: rejects an unknown template and an over-long script", async () => {
    await expect(saveSegmentScript(seg({}), { key: "nope", text: null })).rejects.toThrow();
    await expect(saveSegmentScript(seg({}), { key: null, text: "x".repeat(8001) })).rejects.toThrow(/too long/);
    expect(updates).toEqual([]);
  });
  it("Lead Gen: text only, blank clears to the client's script; a template key is refused", async () => {
    await saveSegmentScript(seg({ crm: "lead_generation" }), { key: null, text: "" });
    expect(updates).toEqual([{ call_script_key: null, call_script_text: null }]);
    await expect(saveSegmentScript(seg({ crm: "lead_generation" }), { key: "website-development", text: null })).rejects.toThrow();
  });
});
