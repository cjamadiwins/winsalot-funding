import { describe, expect, it } from "vitest";
import { buildProspectProposal, proposalFilename, proposalPlainText, type ProspectProposalInput } from "../leadgen-prospect-proposal";

const ILV: ProspectProposalInput = {
  lead: { business_name: "ILV Plumbing Services", contact_name: "ilias", city: "Winnipeg", province: "MB", industry: "Plumbing", website: "https://ilvplumbing.com/" },
  client: { name: "Teknokraft Canada Inc.", booking_link: "https://leads.winsalotcorp.com/book/teknokraft-canada", services_info_link: "https://www.teknokraft.ca" },
  approvedServices: ["new_website", "redesign_rebranding", "seo_visibility", "digital_marketing"],
  verifiedFacts: ["You spoke with our team and asked us to send information by email."],
  preparedOn: "2026-11-12",
};

describe("Teknokraft proposal for ILV Plumbing Services", () => {
  const { content, emailBody, emailSubject, filename } = buildProspectProposal(ILV);
  const text = proposalPlainText(content, emailBody);

  it("is personalized for the prospect, Winnipeg and plumbing", () => {
    expect(content.preparedFor).toMatchObject({ business: "ILV Plumbing Services", contact: "Ilias", location: "Winnipeg, MB", industry: "Plumbing", website: "ilvplumbing.com" });
    expect(text).toContain("Winnipeg");
    expect(text).toMatch(/plumbing/i);
    expect(emailSubject).toBe("Proposal for ILV Plumbing Services from Teknokraft Canada Inc.");
    expect(filename).toBe("Teknokraft-Proposal-ILV-Plumbing-Services.pdf");
  });

  it("covers every required topic", () => {
    const headings = content.sections.map((s) => s.heading).join("\n");
    expect(headings).toMatch(/Website development and improvement/);
    expect(headings).toMatch(/Google search engine optimization/);
    expect(headings).toMatch(/Digital marketing/);
    expect(headings).toMatch(/How this can help ILV Plumbing Services/);
    for (const t of [/mobile-friendly/i, /build trust/i, /Local SEO targeting Winnipeg/, /plumbing service keywords/i, /Google Business Profile optimization/, /visibility in local searches/i, /Technical and on-page SEO/, /Google Ads/, /Attract more local customers in Winnipeg/, /Increase your online visibility/, /Generate more plumbing service inquiries/, /call or request service/]) expect(text).toMatch(t);
  });

  it("does not assume a new website is needed: it proposes a review of the existing one", () => {
    expect(text).toMatch(/already has a website \(ilvplumbing\.com\)/);
    expect(text).toMatch(/starting|start by reviewing|reviewing it, not assuming anything needs to change/i);
    expect(text).not.toMatch(/you need a new website|your (current )?website is (outdated|poor|broken)|replace your website/i);
    expect(text).toMatch(/Nothing here assumes a problem with your current website/);
  });

  it("without a website on file it asks first and still does not presume", () => {
    const noSite = buildProspectProposal({ ...ILV, lead: { ...ILV.lead, website: null } });
    const t = proposalPlainText(noSite.content, noSite.emailBody);
    expect(t).toMatch(/Website: not confirmed/);
    expect(t).toMatch(/confirm whether .* has a website today/i);
    expect(t).not.toMatch(/already has a website/);
  });

  it("includes no pricing, no guarantees and no unapproved services", () => {
    expect(text).not.toMatch(/\$\s?\d|\d\s?(dollars|CAD)|per month|\/month|discount|\bfree\b/i);
    expect(text).not.toMatch(/first[- ]page|page one|number one|#1\b|top spot|top of google|rank(s|ed)? (first|#?1)/i);
    // "guarantee" only ever appears in the disclaimer / email sentence that denies one.
    for (const m of text.matchAll(/[^.\n]*guarantee[^.\n]*/gi)) expect(m[0]).toMatch(/does not guarantee|do not promise|not promise/i);
    expect(text).toMatch(/does not include pricing/);
    expect(text).not.toMatch(/e-?commerce|human search optimi[sz]ation|\bHSO\b/i);
    expect(content.disclaimer.join(" ")).toMatch(/does not guarantee any specific Google ranking, search position, website traffic, number of inquiries or sales result/);
  });

  it("only includes services Admin approved", () => {
    const seoOnly = buildProspectProposal({ ...ILV, approvedServices: ["seo_visibility"] });
    const h = seoOnly.content.sections.map((s) => s.heading).join("\n");
    expect(h).toMatch(/Google search engine optimization/);
    expect(h).not.toMatch(/Website development/);
    expect(h).not.toMatch(/Digital marketing/);
    expect(proposalPlainText(seoOnly.content, seoOnly.emailBody)).not.toMatch(/Google Ads/);
    // Numbering stays continuous when a service is not offered.
    expect(seoOnly.content.sections.map((s) => s.heading.charAt(0))).toEqual(["1", "2", "3"]);
  });

  it("invites a consultation with the client's booking link, and never claims it is free", () => {
    expect(content.nextStep.bookingUrl).toBe("https://leads.winsalotcorp.com/book/teknokraft-canada");
    expect(content.nextStep.heading).toMatch(/consultation/i);
    expect(emailBody).toContain("[Schedule a consultation]\n\nhttps://leads.winsalotcorp.com/book/teknokraft-canada");
    expect(emailBody).toContain("[Visit Teknokraft Canada Inc.]\n\nhttps://www.teknokraft.ca");
  });

  it("email is addressed to Ilias, signed by Winsalot on behalf of Teknokraft, and mentions the attachment", () => {
    expect(emailBody.startsWith("Hi Ilias,")).toBe(true);
    expect(emailBody).toMatch(/proposal for ILV Plumbing Services is attached/);
    expect(emailBody.trimEnd().endsWith("Winsalot Corp.\nOn behalf of Teknokraft Canada Inc.")).toBe(true);
  });

  it("states only facts the CRM holds", () => {
    expect(content.whatWeKnow).toContain("Business: ILV Plumbing Services (Plumbing), Winnipeg, MB");
    expect(content.whatWeKnow).toContain("Contact: Ilias");
    expect(content.whatWeKnow).toContain("Website on file: ilvplumbing.com");
    expect(content.whatWeKnow).toContain("You spoke with our team and asked us to send information by email.");
    // Nothing about the owner / decision-maker, headcount, revenue or defects is asserted.
    expect(text).not.toMatch(/owner of|decision[- ]maker|employees|revenue/i);
  });

  it("builds a safe filename", () => {
    expect(proposalFilename("A/B <Plumbing> & Co.")).toBe("Teknokraft-Proposal-A-B-Plumbing-Co.pdf");
  });
});
