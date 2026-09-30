import { describe, expect, it } from "vitest";
import { buildCallListCampaignName } from "../call-list-campaign-name";

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
