import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  workspaceCampaigns,
  loadCampaignWorkspace,
} from "../leadgen-campaign-workspace";
import { websiteOpportunity } from "../leadgen-website-opportunity";
import { createFakeDb } from "./fake-supabase";

const campaigns = [
  { id: "roof", name: "Roofing", client_id: "tek", clientName: "Teknokraft" },
  {
    id: "other",
    name: "Existing",
    client_id: "hide",
    clientName: "Hidebrandt",
  },
];
function fixture() {
  return createFakeDb({
    leadgen_clients: [
      { id: "tek", name: "Teknokraft", active: true, is_internal_test: false },
      { id: "hide", name: "Hidebrandt", active: true, is_internal_test: false },
      {
        id: "unrelated",
        name: "Unrelated",
        active: true,
        is_internal_test: false,
      },
    ],
    leadgen_campaigns: [
      ...campaigns.map((c) => ({ ...c, status: "active" })),
      {
        id: "secret",
        client_id: "unrelated",
        name: "Secret",
        status: "active",
      },
    ],
    leadgen_campaign_agents: [
      { campaign_id: "roof", agent_id: "goodness" },
      { campaign_id: "other", agent_id: "goodness" },
    ],
    call_list_segments: [
      {
        id: "roof-list",
        name: "Roofing",
        crm: "lead_generation",
        status: "active",
        leadgen_campaign_id: "roof",
      },
      {
        id: "other-list",
        name: "Other",
        crm: "lead_generation",
        status: "active",
        leadgen_campaign_id: "other",
      },
    ],
    call_list_leads: [
      {
        id: "r",
        business_name: "Roof",
        website: "https://roof.ca",
        segment_id: "roof-list",
        promoted_leadgen_lead_id: "promoted",
        last_outcome: "Interested",
        callback_at: "2020-01-01",
      },
      { id: "o", business_name: "Other", segment_id: "other-list" },
    ],
    leadgen_leads: [
      {
        id: "promoted",
        business_name: "Roof",
        website: "https://roof.ca",
        campaign_id: "roof",
        assigned_agent_id: "goodness",
        status: "Appointment booked",
        next_follow_up_at: null,
      },
      {
        id: "colleague",
        campaign_id: "roof",
        assigned_agent_id: "henry",
        business_name: "Not mine",
      },
    ],
    leadgen_call_logs: [
      {
        id: "r1",
        campaign_id: "roof",
        agent_id: "goodness",
        outcome: "Interested",
      },
      {
        id: "o1",
        campaign_id: "other",
        agent_id: "goodness",
        outcome: "No Answer",
      },
      {
        id: "r2",
        campaign_id: "roof",
        agent_id: "henry",
        outcome: "Interested",
      },
    ],
    leadgen_appointments: [
      {
        id: "a",
        campaign_id: "roof",
        booking_agent_id: "goodness",
        status: "Booked",
      },
      {
        id: "b",
        campaign_id: "other",
        booking_agent_id: "goodness",
        status: "Booked",
      },
      {
        id: "c",
        campaign_id: "roof",
        booking_agent_id: "henry",
        status: "Booked",
      },
    ],
  });
}
const asDb = (db: ReturnType<typeof createFakeDb>) =>
  db.client as unknown as SupabaseClient;
describe("campaign workspace", () => {
  it("offers both assigned clients but never unrelated clients", async () => {
    const db = fixture();
    expect(
      (await workspaceCampaigns(asDb(db), "goodness")).map((c) => c.id).sort(),
    ).toEqual(["other", "roof"]);
    expect(await workspaceCampaigns(asDb(db), "unassigned")).toEqual([]);
  });
  it("switches campaign activity without mixing other clients or agents", async () => {
    const db = fixture();
    const roof = await loadCampaignWorkspace(
      asDb(db),
      campaigns,
      "roof",
      "goodness",
    );
    expect(roof.stats).toEqual({
      total: 1,
      rebranding: 1,
      new_website: 0,
      verification_needed: 0,
      calls: 1,
      reached: 1,
      appointments: 1,
      followups: 0,
      interested: 0,
    });
    expect(roof.calls.map((c) => c.id)).toEqual(["r1"]);
    expect(roof.appointments.map((a) => a.id)).toEqual(["a"]);
    const other = await loadCampaignWorkspace(
      asDb(db),
      campaigns,
      "other",
      "goodness",
    );
    expect(other.leads.map((l) => l.id)).toEqual(["o"]);
    expect(other.calls.map((c) => c.id)).toEqual(["o1"]);
    expect(db.writes).toEqual([]);
  });
  it("provides combined admin totals while preserving per-campaign views", async () => {
    const data = await loadCampaignWorkspace(
      asDb(fixture()),
      campaigns,
      undefined,
    );
    expect(data.stats.calls).toBe(3);
    expect(data.stats.appointments).toBe(3);
  });
  it("rejects unassigned or forged selections and read failures", async () => {
    await expect(
      loadCampaignWorkspace(asDb(fixture()), campaigns, "secret", "goodness"),
    ).rejects.toThrow("not assigned");
    const db = createFakeDb({}, { failTables: ["call_list_segments"] });
    await expect(
      loadCampaignWorkspace(asDb(db), campaigns, "roof", "goodness"),
    ).rejects.toThrow("Unable to load");
  });
  it("counts more than 1000 calls without truncation", async () => {
    const db = fixture();
    db.tables.leadgen_call_logs = Array.from({ length: 1205 }, (_, i) => ({
      id: String(i).padStart(5, "0"),
      campaign_id: "roof",
      agent_id: "goodness",
      outcome: "No Answer",
    }));
    expect(
      (await loadCampaignWorkspace(asDb(db), campaigns, "roof", "goodness"))
        .stats.calls,
    ).toBe(1205);
  });
});
describe("website opportunities", () => {
  it("requires affirmative evidence before classifying no website", () => {
    for (const value of [
      null,
      "",
      "N/A",
      "unknown",
      "https://facebook.com/company",
      "javascript:alert(1)",
    ])
      expect(websiteOpportunity(value)).toBe("verification_needed");
    expect(websiteOpportunity(null, "verified_no_website")).toBe("new_website");
    expect(websiteOpportunity("https://roof.ca", "verified_no_website")).toBe(
      "rebranding",
    );
    expect(websiteOpportunity("roof.ca")).toBe("rebranding");
  });
});
