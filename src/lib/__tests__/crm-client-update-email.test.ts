import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../site-url", () => ({ getSiteUrl: () => "https://growth.winsalotcorp.com" }));

import { renderClientUpdateEmail } from "../crm-client-update-email";
import { buildCampaignSetupDraft } from "../crm-client-communications-shared";

describe("renderClientUpdateEmail", () => {
  const draft = buildCampaignSetupDraft({
    contactName: "Theodore",
    companyName: "Hidebrandt Web Services",
    campaignName: "Website Services Lead Generation",
    service: null,
    campaignStartDate: "2026-09-29",
    depositReceivedLabel: "CA$250.00",
  });
  const email = renderClientUpdateEmail(draft.subject, draft.message);

  it("keeps the exact subject and is branded Winsalot Corp. with the existing logo", () => {
    expect(email.subject).toBe("Your Winsalot Corp. Campaign Setup Is Complete");
    expect(email.html).toContain("https://growth.winsalotcorp.com/winsalot-logo.png");
    expect(email.html).toContain("Winsalot Corp.");
    expect(email.html).not.toMatch(/Winsalot Corp(?![.<"])/);
  });

  it("renders bullets as a list and escapes anything Admin types", () => {
    expect(email.html).toContain("<ul");
    const unsafe = renderClientUpdateEmail("Hi", "<script>alert(1)</script>");
    expect(unsafe.html).not.toContain("<script>");
    expect(unsafe.html).toContain("&lt;script&gt;");
    expect(unsafe.text).toBe("<script>alert(1)</script>");
  });
});
