import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import ClientCampaignFields from "../../app/leadgen/agent/(dashboard)/leads/new/ClientCampaignFields";
import type { LeadgenCampaignRow, LeadgenClientRow } from "../leadgen-types";

const clients = [{ id: "tek", name: "Teknokraft Canada Inc." }] as LeadgenClientRow[];
const campaigns = [{ id: "c1", client_id: "tek", name: "Toronto Snow Removal" }] as LeadgenCampaignRow[];

describe("agent Add Lead form", () => {
  it("makes Campaign required and offers no 'No campaign' choice", () => {
    const html = renderToStaticMarkup(<ClientCampaignFields clients={clients} campaigns={campaigns} preselectedClientId="tek" />);
    const select = html.match(/<select name="campaign_id"[^>]*>/)?.[0] ?? "";
    expect(select).toContain("required");
    expect(html).toContain("Select a campaign…");
    expect(html).toContain("Toronto Snow Removal");
    expect(html).not.toContain("No campaign");
  });

  it("tells the agent when the chosen client has no campaign assigned to them", () => {
    const html = renderToStaticMarkup(<ClientCampaignFields clients={clients} campaigns={[]} preselectedClientId="tek" />);
    expect(html).toContain("No active campaigns assigned to you");
  });
});

describe("Admin Add Lead and CSV upload forms", () => {
  const source = readFileSync("src/app/leadgen/admin/(dashboard)/leads/LeadsListClient.tsx", "utf8");
  it("require a campaign and no longer offer 'No campaign'", () => {
    expect(source).not.toContain("No campaign");
    expect(source).not.toContain("Campaign (optional)");
    expect(source.match(/<select name="campaign_id" required/g)).toHaveLength(2);
  });
  it("only offer active campaigns", () => {
    expect(source.match(/c\.status === "active"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
