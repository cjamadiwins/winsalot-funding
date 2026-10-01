import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { resolveScriptOverride, validateCampaignForm, type CampaignFormInput } from "@/lib/leadgen-campaign-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
import SegmentAssignmentPanelClient from "@/components/crm-call-list/SegmentAssignmentPanelClient";

const input = (over: Partial<CampaignFormInput> = {}): CampaignFormInput => ({
  name: "  Oakville Pet Care ", industry: "Pet care", territory: "Oakville, ON", description: "", script: "   ", status: "active", startDate: "", adminNotes: "", agentIds: ["a", "a", "b"], ...over,
});

describe("validateCampaignForm", () => {
  it("normalises blanks to null, trims, de-dupes agents", () => {
    const r = validateCampaignForm(input());
    if (r.error !== undefined) throw new Error(r.error);
    expect(r.fields).toEqual({ name: "Oakville Pet Care", target_industry: "Pet care", territory: "Oakville, ON", description: null, call_script_text: null, status: "active", start_date: null });
    expect(r.agentIds).toEqual(["a", "b"]);
  });
  it("rejects bad input", () => {
    expect(validateCampaignForm(input({ name: " " })).error).toMatch(/name is required/);
    expect(validateCampaignForm(input({ status: "draft" })).error).toMatch(/Active, Paused or Completed/);
    expect(validateCampaignForm(input({ startDate: "2026-02-30" })).error).toMatch(/valid date/);
    expect(validateCampaignForm(input({ script: "x".repeat(8001) })).error).toMatch(/too long/);
  });
  it("accepts a valid start date and custom script", () => {
    const r = validateCampaignForm(input({ startDate: "2026-10-05", script: " Hi ", status: "paused" }));
    if (r.error !== undefined) throw new Error(r.error);
    expect(r.fields).toMatchObject({ start_date: "2026-10-05", call_script_text: "Hi", status: "paused" });
  });
});

describe("resolveScriptOverride", () => {
  it("is list -> campaign -> client; blank campaign keeps client behaviour", () => {
    expect(resolveScriptOverride({ listText: "L", campaignText: "C", clientOverride: "K" })).toBe("L");
    expect(resolveScriptOverride({ listText: null, campaignText: "C", clientOverride: "K" })).toBe("C");
    expect(resolveScriptOverride({ listText: " ", campaignText: "  ", clientOverride: "K" })).toBe("K");
    expect(resolveScriptOverride({ campaignText: null, clientOverride: null })).toBeNull();
  });
});

describe("Call List Assignment campaign actions", () => {
  const base = {
    segmentId: "s1", scopeLabel: "Campaign / List", scopeOptions: [], initialScope: "c1",
    clientOptions: [{ value: "cl1", label: "Teknokraft Canada Inc." }], initialClientId: "cl1",
    campaignsByClient: { cl1: [{ value: "c1", label: "Snow Removal" }] },
    agents: [{ id: "a", name: "Agent A" }], assignedAgentIds: [], saveAction: async () => ({}),
  };
  const manager = {
    details: { c1: { id: "c1", clientId: "cl1", name: "Snow Removal", industry: "", territory: "", description: "", script: "", status: "active" as const, startDate: "", adminNotes: "", agentIds: [] } },
    createAction: async () => ({}), updateAction: async () => ({}),
  };
  it("shows + New Campaign and Edit Campaign for Lead Gen Admin", () => {
    const html = renderToStaticMarkup(<SegmentAssignmentPanelClient {...base} campaignManager={manager} />);
    expect(html).toContain("New Campaign");
    expect(html).toContain("Edit Campaign");
    expect(html).toContain("Save Assignment");
  });
  it("shows neither when no campaign manager is provided (Growth CRM)", () => {
    const html = renderToStaticMarkup(<SegmentAssignmentPanelClient {...base} />);
    expect(html).not.toContain("New Campaign");
    expect(html).not.toContain("Edit Campaign");
  });
});
