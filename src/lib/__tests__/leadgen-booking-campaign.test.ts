import { describe, expect, it } from "vitest";
import { appointmentNeedsCampaignReview, decideBookingCampaign, openLeadsForEmail, resolveBookingCampaign } from "../leadgen-booking-campaign";
import { createFakeDb } from "./fake-supabase";

const teknokraft = { id: "cl-tek", name: "Teknokraft Canada Inc.", slug: "teknokraft-canada" };
const brents = { id: "cl-brent", name: "Brent's Essentials", slug: "brentsessentials" };

const sixActive = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id: `tek-${id}`, status: "active" }));

describe("decideBookingCampaign - campaign only from verified evidence", () => {
  it("uses the campaign of the prospect's matching open lead", () => {
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [{ campaign_id: "tek-b" }], clientCampaigns: sixActive })).toEqual({
      campaignId: "tek-b",
      source: "matched_lead",
    });
  });

  it("accepts several matching leads only when they all agree", () => {
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [{ campaign_id: "tek-b" }, { campaign_id: "tek-b" }], clientCampaigns: sixActive })).toMatchObject({
      campaignId: "tek-b",
    });
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [{ campaign_id: "tek-b" }, { campaign_id: "tek-c" }], clientCampaigns: sixActive })).toEqual({
      campaignId: null,
      reason: "ambiguous",
    });
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [{ campaign_id: "tek-b" }, { campaign_id: null }], clientCampaigns: sixActive })).toEqual({
      campaignId: null,
      reason: "ambiguous",
    });
  });

  it("never trusts a lead campaign that belongs to a different client", () => {
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [{ campaign_id: "someone-elses" }], clientCampaigns: sixActive })).toEqual({
      campaignId: null,
      reason: "ambiguous",
    });
  });

  it("falls back to the client's single active campaign, ignoring paused ones", () => {
    const campaigns = [
      { id: "only", status: "active" },
      { id: "old", status: "paused" },
    ];
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [], clientCampaigns: campaigns })).toEqual({ campaignId: "only", source: "sole_active_campaign" });
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [{ campaign_id: null }], clientCampaigns: campaigns })).toEqual({
      campaignId: "only",
      source: "sole_active_campaign",
    });
  });

  it("leaves it unassigned (review queue) when several campaigns are active and nothing identifies one", () => {
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [], clientCampaigns: sixActive })).toEqual({ campaignId: null, reason: "ambiguous" });
  });

  it("leaves it unassigned when the client has no active campaign", () => {
    expect(decideBookingCampaign({ client: teknokraft, openLeads: [], clientCampaigns: [{ id: "p", status: "paused" }] })).toEqual({
      campaignId: null,
      reason: "no_active_campaign",
    });
  });

  it("keeps Brent's Essentials on its original behaviour: no automatic campaign", () => {
    expect(decideBookingCampaign({ client: brents, openLeads: [], clientCampaigns: [{ id: "only", status: "active" }] })).toEqual({
      campaignId: null,
      reason: "ambiguous",
    });
  });
});

describe("openLeadsForEmail", () => {
  const leads = [
    { id: "1", status: "Interested", email: "John_Smith@Example.com", campaign_id: "x" },
    { id: "2", status: "Closed", email: "john_smith@example.com", campaign_id: "y" },
    { id: "3", status: "New", email: "johnXsmith@example.com", campaign_id: "z" },
  ];
  it("matches the exact address case-insensitively, skipping closed leads and SQL-wildcard look-alikes", () => {
    expect(openLeadsForEmail(leads, " john_smith@EXAMPLE.com ").map((l) => l.id)).toEqual(["1"]);
  });
  it("matches nothing without an email", () => {
    expect(openLeadsForEmail(leads, "")).toEqual([]);
    expect(openLeadsForEmail(leads, null)).toEqual([]);
  });
});

describe("appointmentNeedsCampaignReview", () => {
  it("queues only upcoming, still-booked appointments with no campaign", () => {
    expect(appointmentNeedsCampaignReview({ status: "Booked", campaign_id: null, appointment_date: "2026-10-20" }, "2026-10-13")).toBe(true);
    expect(appointmentNeedsCampaignReview({ status: "Booked", campaign_id: null, appointment_date: "2026-10-13" }, "2026-10-13")).toBe(true);
    expect(appointmentNeedsCampaignReview({ status: "Booked", campaign_id: null, appointment_date: "2026-08-21" }, "2026-10-13")).toBe(false);
    expect(appointmentNeedsCampaignReview({ status: "Booked", campaign_id: "c1", appointment_date: "2026-10-20" }, "2026-10-13")).toBe(false);
    expect(appointmentNeedsCampaignReview({ status: "Cancelled", campaign_id: null, appointment_date: "2026-10-20" }, "2026-10-13")).toBe(false);
  });
});

describe("resolveBookingCampaign (data loading)", () => {
  it("returns the newest open lead as the link and its campaign as the decision", async () => {
    const { client, tables } = createFakeDb({
      leadgen_leads: [
        { id: "old", client_id: "cl-tek", email: "owner@pets.ca", status: "Closed", campaign_id: "tek-a", created_at: "2026-09-01" },
        { id: "new", client_id: "cl-tek", email: "OWNER@pets.ca", status: "Interested", campaign_id: "tek-b", created_at: "2026-10-01" },
        { id: "other-client", client_id: "cl-other", email: "owner@pets.ca", status: "New", campaign_id: "x", created_at: "2026-10-05" },
      ],
      leadgen_campaigns: sixActive.map((c) => ({ ...c, client_id: "cl-tek" })),
    });
    const resolved = await resolveBookingCampaign(client, teknokraft, "owner@pets.ca");
    expect(resolved).toEqual({ matchedLeadId: "new", decision: { campaignId: "tek-b", source: "matched_lead" } });
    expect(tables.leadgen_leads).toHaveLength(3); // read-only
  });

  it("with no email it links nothing and falls back safely", async () => {
    const { client } = createFakeDb({ leadgen_leads: [], leadgen_campaigns: sixActive.map((c) => ({ ...c, client_id: "cl-tek" })) });
    expect(await resolveBookingCampaign(client, teknokraft, null)).toEqual({ matchedLeadId: null, decision: { campaignId: null, reason: "ambiguous" } });
  });
});
