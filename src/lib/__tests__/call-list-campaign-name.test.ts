import { describe, expect, it } from "vitest";
import { buildCallListCampaignName, buildLeadgenListCampaignName, isWebsiteSeoClient, WEBSITE_SEO_SERVICE_LABEL } from "../call-list-campaign-name";

describe("buildCallListCampaignName", () => {
  it("uses the client, industry, and location without changing import data", () => {
    expect(buildCallListCampaignName({ clientName: "Teknokraft Canada Inc.", industry: "Pet Sitter", location: "Niagara Falls" }))
      .toBe("Teknokraft Canada Inc. — Pet Sitter — Niagara Falls");
  });

  it("trims empty metadata and keeps the client name", () => {
    expect(buildCallListCampaignName({ clientName: "Hidebrandt Web Services", industry: " Auto Repair ", location: " " }))
      .toBe("Hidebrandt Web Services — Auto Repair");
  });
});

describe("Website & SEO umbrella label (Hidebrandt + Teknokraft)", () => {
  it("is exactly the umbrella service label; niche and market stay in the list name", () => {
    expect(buildLeadgenListCampaignName({ clientName: "Teknokraft Canada Inc.", industry: "Pet Sitter / Pet Care", location: "Ottawa, Ontario" })).toBe("Lead Generation for Website & SEO");
    expect(buildLeadgenListCampaignName({ clientName: "Hidebrandt Web Services", industry: "Painting Companies", location: "Winnipeg, Manitoba" })).toBe("Lead Generation for Website & SEO");
    expect(WEBSITE_SEO_SERVICE_LABEL).toBe("Lead Generation for Website & SEO");
  });

  it("never adds Website/SEO wording per list or sub-categories like Website Design / Needs Rebrand / SEO Leads", () => {
    const label = buildLeadgenListCampaignName({ clientName: "Hidebrandt Web Services", industry: "Auto Repair Shops", location: "Toronto, Ontario" });
    expect(label).not.toMatch(/Website Design|Needs Rebrand|SEO Leads|Auto Repair|Toronto/);
  });

  it("leaves every other client's list label unchanged", () => {
    expect(isWebsiteSeoClient("Web6 Solutions")).toBe(false);
    expect(buildLeadgenListCampaignName({ clientName: "Web6 Solutions", industry: "Auto Repair", location: "Toronto" })).toBe("Web6 Solutions — Auto Repair — Toronto");
  });
});
