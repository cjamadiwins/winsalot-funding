import { describe, expect, it } from "vitest";
import {
  PROPOSAL_REQUIREMENTS_PLACEHOLDER,
  PROPOSAL_STATUSES,
  buildProposalRequestDraft,
  buildProposalRequestSubject,
  formatProposalPhone,
  formatProposalWebsite,
  formatProposalAddress,
  hasActiveProposalRequest,
  isProposalStatus,
  nextStatusAfterRequest,
  proposalStatusLabel,
  summarizeProposals,
  supportsProposalBrief,
  validatePreparedProposal,
  validateProposalRequest,
} from "../leadgen-proposal";
import type { LeadgenClientRow, LeadgenLeadRow } from "../leadgen-types";

const teknokraft = { name: "Teknokraft Canada Inc.", slug: "teknokraft-canada" };
const boondock = {
  business_name: "Boondock Pet Resort",
  contact_name: "Marissa",
  industry: "Pet Care",
  email: "info@boondockspetresort.com",
  phone: "(905) 227-6336",
  website: "https://www.boondockspetresort.com/about.html",
  notes: null,
  client_notes: null,
} as Pick<LeadgenLeadRow, "business_name" | "contact_name" | "industry" | "email" | "phone" | "website" | "notes" | "client_notes">;

// The message exactly as specified, with the requirements placeholder left in
// for the Admin to complete.
const EXPECTED_BODY = `Hello Teknokraft Team,

We have a prospective customer interested in receiving a website design proposal.

Please find the prospect’s information below.

Business Name: Boondock Pet Resort
Contact Person: Marissa
Industry: Pet Care
Email: info@boondockspetresort.com
Phone: +1 905-227-6336
Website: https://www.boondockspetresort.com/about.html
Service Requested: Website design or redesign proposal — specific requirements to be confirmed.
Proposal Requirements: [Insert verified prospect requirements, project scope, budget, and timeline where available.]

Please review the opportunity and prepare an appropriate proposal based on the prospect’s requirements.

Kindly confirm when the proposal is ready so we can coordinate the next steps.

Best regards,
Winsalot Corp.
Lead Generation Team
info@winsalotcorp.com
https://winsalotcorp.com`;

describe("proposal request email draft", () => {
  it("reproduces the specified subject and body for Teknokraft / Boondock Pet Resort", () => {
    const draft = buildProposalRequestDraft({ client: teknokraft, lead: boondock });
    expect(draft.subject).toBe("Proposal Requested – Boondock Pet Resort | Teknokraft Canada Inc.");
    expect(draft.body).toBe(EXPECTED_BODY);
  });

  it("works for any client: name, greeting and wording follow the client, not Teknokraft", () => {
    const draft = buildProposalRequestDraft({ client: { name: "Brent's Essentials", slug: "brentsessentials" }, lead: boondock });
    expect(draft.subject).toBe("Proposal Requested – Boondock Pet Resort | Brent's Essentials");
    expect(draft.body).toContain("Hello Brent's Essentials Team,");
    expect(draft.body).toContain("interested in receiving a proposal.");
    expect(draft.body).toContain("Service Requested: Proposal for Brent's Essentials services — specific requirements to be confirmed.");
    expect(draft.body).not.toContain("Teknokraft");
    expect(draft.body).not.toContain("website design");
  });

  it("uses website-design wording for the other website-services clients", () => {
    const draft = buildProposalRequestDraft({ client: { name: "Hidebrandt Web Services", slug: "hidebrandt-web-services" }, lead: boondock });
    expect(draft.body).toContain("Hello Hidebrandt Web Services Team,");
    expect(draft.body).toContain("website design proposal");
  });

  it("marks missing prospect fields as not provided instead of leaving blanks", () => {
    const draft = buildProposalRequestDraft({ client: teknokraft, lead: { ...boondock, contact_name: null, industry: " ", email: null, phone: null, website: null } });
    expect(draft.body).toContain("Contact Person: Not provided");
    expect(draft.body).toContain("Industry: Not provided");
    expect(draft.body).toContain("Email: Not provided");
    expect(draft.body).toContain("Phone: Not provided");
    expect(draft.body).toContain("Website: Not provided");
  });

  it("never copies internal notes into the message", () => {
    const secret = "INTERNAL: owner is difficult, EMAIL ONLY — DO NOT CALL, budget flexible to $9,999";
    const draft = buildProposalRequestDraft({ client: teknokraft, lead: { ...boondock, notes: secret, client_notes: "client-visible note text" } });
    expect(draft.body).not.toContain("INTERNAL");
    expect(draft.body).not.toContain("DO NOT CALL");
    expect(draft.body).not.toContain("9,999");
    expect(draft.body).not.toContain("client-visible note text");
  });

  it("prefills only the DETECTED requirement topics (never the note text) when the prospect asked for them", () => {
    const draft = buildProposalRequestDraft({
      client: teknokraft,
      lead: { ...boondock, notes: "Requests a detailed proposal via email covering scope, cost and timeline. Secret internal remark." },
    });
    expect(draft.body).toContain("The prospect has asked the proposal to cover: scope of work; project cost; estimated project duration / completion timeline.");
    expect(draft.body).not.toContain(PROPOSAL_REQUIREMENTS_PLACEHOLDER);
    expect(draft.body).not.toContain("Secret internal remark");
    expect(validateProposalRequest(draft)).toBeNull();
  });
});

describe("proposal brief: the generated request for a specific prospect", () => {
  const tek = { name: "Teknokraft Canada Inc.", slug: "teknokraft-canada" } as LeadgenClientRow;
  const embark = {
    business_name: "emBARK Pet Transport",
    contact_name: "Matt",
    industry: null,
    email: "info@embarkpettransport.com",
    phone: "+1 343-887-9858",
    website: "https://www.embarkpettransport.com",
    notes: "INTERNAL remark that must never appear",
    client_notes: null,
  } as unknown as LeadgenLeadRow;
  const full = buildProposalRequestDraft({ client: tek, lead: embark, brief: { decisionMaker: "Matt", services: ["seo", "website_improvements", "rebranding"], assignedAgent: "Henry Osuji" } });

  it("addresses Teknokraft and names Matt as the decision-maker, with every contact detail", () => {
    expect(full.subject).toBe("Proposal Requested – emBARK Pet Transport | Teknokraft Canada Inc.");
    expect(full.body).toContain("Hello Teknokraft Team,");
    expect(full.body).toContain("Business Name: emBARK Pet Transport");
    expect(full.body).toContain("Decision-Maker: Matt");
    expect(full.body).toContain("Matt is the decision-maker for this proposal");
    expect(full.body).toContain("Email: info@embarkpettransport.com");
    expect(full.body).toContain("Phone: +1 343-887-9858");
    expect(full.body).toContain("Website: https://www.embarkpettransport.com");
    expect(full.body).toContain("Winsalot Agent: Henry Osuji");
  });

  it("lists SEO and the website improvements as requested, and rebranding only as a possible, unapproved add-on", () => {
    expect(full.body).toContain("1. Search Engine Optimization (SEO) to improve Google search visibility and attract potential customers.");
    expect(full.body).toContain("2. Recommendations to improve the website’s functionality, user experience and the customer inquiries it generates.");
    const [requested, additional] = full.body.split("Possible additional service (not approved):");
    expect(requested).not.toMatch(/rebrand/i);
    expect(additional).toContain("3. Website rebranding to modernize the company’s online presence.");
    expect(additional).toContain("it is not an approved project");
  });

  it("asks Teknokraft to review the website, recommend an SEO strategy, and give pricing, deliverables and timelines", () => {
    expect(full.body).toContain("Review the prospect’s existing website and recommend an appropriate SEO strategy.");
    expect(full.body).toContain("Recommend improvements to the website’s functionality, user experience and customer inquiries.");
    expect(full.body).toContain("Estimated pricing for each service");
    expect(full.body).toContain("The deliverables included in each service.");
    expect(full.body).toContain("Implementation timelines.");
    expect(full.body).toContain("Outline website rebranding separately as an optional add-on");
    // The optional ask comes after the core asks.
    expect(full.body.indexOf("Implementation timelines.")).toBeLessThan(full.body.indexOf("Outline website rebranding"));
  });

  it("never invents a price, guarantees a ranking or promises a result", () => {
    expect(full.body).not.toMatch(/[$€£]\s?\d|\d\s?(?:USD|CAD|dollars)/i);
    expect(full.body).not.toMatch(/\b(?:#1|number one|first page|top of google|page one)\b/i);
    expect(full.body).not.toMatch(/we (?:guarantee|promise)|will (?:rank|increase|double|triple)|guaranteed (?:to|results)/i);
    expect(full.body).toContain("does not commit Winsalot Corp. or the prospect to any price, scope, ranking or result");
    expect(full.body).toContain("do not guarantee specific search rankings or results");
  });

  it("has no bracketed placeholder, never copies internal notes, and is ready for review and sending", () => {
    expect(full.body).not.toContain("[Insert");
    expect(full.body).not.toContain("INTERNAL remark");
    expect(validateProposalRequest(full)).toBeNull();
    expect(validatePreparedProposal(full)).toBeNull();
  });

  it("leaves rebranding out entirely when it was not selected, and still asks for pricing, deliverables and timelines", () => {
    const seoOnly = buildProposalRequestDraft({ client: tek, lead: embark, brief: { decisionMaker: "Matt", services: ["seo"] } });
    expect(seoOnly.body).not.toMatch(/rebrand/i);
    expect(seoOnly.body).not.toContain("Possible additional service");
    expect(seoOnly.body).not.toContain("Winsalot Agent:");
    expect(seoOnly.body).toContain("Implementation timelines.");
  });

  it("falls back to the lead's contact when no decision-maker is typed, and says so plainly when neither exists", () => {
    expect(buildProposalRequestDraft({ client: tek, lead: embark, brief: { decisionMaker: "  ", services: ["seo"] } }).body).toContain("Decision-Maker: Matt");
    const none = buildProposalRequestDraft({ client: tek, lead: { ...embark, contact_name: null } as LeadgenLeadRow, brief: { services: ["seo"] } });
    expect(none.body).toContain("Decision-Maker: Not provided");
    expect(none.body).not.toContain("is the decision-maker for this proposal");
  });

  it("without a brief (or with no service chosen) the original request is produced unchanged for every lead", () => {
    const original = buildProposalRequestDraft({ client: tek, lead: embark });
    expect(buildProposalRequestDraft({ client: tek, lead: embark, brief: { decisionMaker: "Matt", services: [] } })).toEqual(original);
    expect(original.body).toContain("Contact Person: Matt");
    expect(original.body).toContain(PROPOSAL_REQUIREMENTS_PLACEHOLDER);
  });

  it("offers the brief only for the website-services clients", () => {
    expect(supportsProposalBrief({ slug: "teknokraft-canada" })).toBe(true);
    expect(supportsProposalBrief({ slug: "hidebrandt-web-services" })).toBe(true);
    expect(supportsProposalBrief({ slug: "acme-roofing" })).toBe(false);
  });
});

describe("second Teknokraft prospect: Imperial Pest Control (services not confirmed)", () => {
  const tek = { name: "Teknokraft Canada Inc.", slug: "teknokraft-canada" } as LeadgenClientRow;
  const imperial = {
    business_name: "Imperial Pest Control",
    contact_name: "Ramish",
    industry: null,
    email: "info@imperialpestcontrol.ca",
    phone: "416-744-0102",
    website: "https://imperialpestcontrol.ca",
    street_address: "2001 Albion Rd #1",
    city: "Etobicoke",
    province: "Ontario",
    postal_code: "M9W 6V6",
    notes: "INTERNAL remark that must never appear",
    client_notes: "The manager specifically requested a proposal and indicated he would contact us after reviewing it.",
  } as unknown as LeadgenLeadRow;
  const embark = {
    business_name: "emBARK Pet Transport",
    contact_name: "Matt",
    industry: null,
    email: "info@embarkpettransport.com",
    phone: "+1 343-887-9858",
    website: "https://www.embarkpettransport.com",
    notes: null,
    client_notes: null,
  } as unknown as LeadgenLeadRow;
  const note = "The decision-maker has asked for a proposal and will contact us after reviewing it.";
  const draft = buildProposalRequestDraft({
    client: tek,
    lead: imperial,
    brief: { decisionMaker: "Ramish", services: ["seo", "website_improvements", "rebranding"], servicesConfirmed: false, prospectNote: note },
  });

  it("is addressed to Teknokraft, names Ramish as the decision-maker, and carries the complete contact information", () => {
    expect(draft.subject).toBe("Proposal Requested – Imperial Pest Control | Teknokraft Canada Inc.");
    expect(draft.body).toContain("Hello Teknokraft Team,");
    expect(draft.body).toContain("Business Name: Imperial Pest Control");
    expect(draft.body).toContain("Decision-Maker: Ramish");
    expect(draft.body).toContain("Ramish is the decision-maker for this proposal");
    expect(draft.body).toContain("Email: info@imperialpestcontrol.ca");
    expect(draft.body).toContain("Phone: +1 416-744-0102");
    expect(draft.body).toContain("Website: https://imperialpestcontrol.ca");
    expect(draft.body).toContain("Address: 2001 Albion Rd #1, Etobicoke, Ontario M9W 6V6");
    expect(draft.body).toContain(`What the prospect told us: ${note}`);
  });

  it("does NOT present SEO, website improvements or rebranding as confirmed requirements", () => {
    expect(draft.body).not.toContain("Services requested");
    expect(draft.body).not.toContain("Possible additional service");
    expect(draft.body).toContain("has not confirmed which services it needs");
    expect(draft.body).toContain("They are not confirmed requirements");
    const possibilities = draft.body.split("not confirmed requirements:")[1].split("What we are asking")[0];
    expect(possibilities).toContain("- Search Engine Optimization (SEO)");
    expect(possibilities).toContain("- Website improvements (functionality, user experience and customer inquiries)");
    expect(possibilities).toContain("- Website rebranding to modernize the company’s online presence");
    expect(draft.body).toContain("It does not approve any project or confirm any service");
    // none of the confirmed-service phrasing from the first prospect's request leaks in
    expect(draft.body).not.toContain("to improve Google search visibility and attract potential customers");
    expect(draft.body).not.toContain("is not an approved project");
  });

  it("asks Teknokraft to review the website, recommend suitable solutions, and give recommended services, pricing, deliverables and timelines", () => {
    expect(draft.body).toContain("Review the prospect’s existing website and recommend suitable digital solutions.");
    expect(draft.body).toContain("or others you consider more appropriate");
    expect(draft.body).toContain("Your recommended services, and why you recommend each one.");
    expect(draft.body).toContain("Estimated pricing for each recommended service, based on your own review.");
    expect(draft.body).toContain("The deliverables included in each recommended service.");
    expect(draft.body).toContain("Implementation timelines.");
  });

  it("invents no price, ranking guarantee or result, has no placeholder, and never copies the lead's notes", () => {
    expect(draft.body).not.toMatch(/[$€£]\s?\d|\d\s?(?:USD|CAD|dollars)/i);
    expect(draft.body).not.toMatch(/\b(?:#1|number one|first page|page one)\b|we (?:guarantee|promise)|will (?:rank|increase|double|triple)/i);
    expect(draft.body).not.toContain("[Insert");
    expect(draft.body).not.toContain("INTERNAL remark");
    expect(draft.body).not.toContain("indicated he would contact");
    expect(validateProposalRequest(draft)).toBeNull();
  });

  it("the prospect's note is optional, whitespace-normalised, and absent when empty", () => {
    const without = buildProposalRequestDraft({ client: tek, lead: imperial, brief: { decisionMaker: "Ramish", services: ["seo"], servicesConfirmed: false } });
    expect(without.body).not.toContain("What the prospect told us");
    const messy = buildProposalRequestDraft({ client: tek, lead: imperial, brief: { decisionMaker: "Ramish", services: ["seo"], servicesConfirmed: false, prospectNote: "  Wants\n a   proposal. " } });
    expect(messy.body).toContain("What the prospect told us: Wants a proposal.");
  });

  it("keeps the two Teknokraft prospects completely separate: nothing from one appears in the other", () => {
    const first = buildProposalRequestDraft({ client: tek, lead: embark, brief: { decisionMaker: "Matt", services: ["seo", "website_improvements", "rebranding"], assignedAgent: "Henry Osuji" } });
    expect(first.body).toContain("Decision-Maker: Matt");
    expect(first.body).toContain("Services requested:");
    expect(first.body).toContain("Possible additional service (not approved):");
    for (const mine of ["Imperial", "Ramish", "imperialpestcontrol", "416-744-0102", "Albion", "Etobicoke"]) expect(first.body + first.subject).not.toContain(mine);
    for (const theirs of ["emBARK", "Matt", "embarkpettransport", "343-887-9858", "Henry Osuji"]) expect(draft.body + draft.subject).not.toContain(theirs);
  });

  it("a confirmed brief (the first prospect's flow) is unchanged by the new option", () => {
    const explicit = buildProposalRequestDraft({ client: tek, lead: embark, brief: { decisionMaker: "Matt", services: ["seo"], servicesConfirmed: true } });
    const implicit = buildProposalRequestDraft({ client: tek, lead: embark, brief: { decisionMaker: "Matt", services: ["seo"] } });
    expect(explicit).toEqual(implicit);
    expect(implicit.body).toContain("Services requested:");
  });
});

describe("formatProposalAddress", () => {
  it("joins the street, city, province and postal code (Canadian style) and omits what is missing", () => {
    expect(formatProposalAddress({ street_address: "2001 Albion Rd #1", city: "Etobicoke", province: "Ontario", postal_code: "M9W 6V6" })).toBe("2001 Albion Rd #1, Etobicoke, Ontario M9W 6V6");
    expect(formatProposalAddress({ city: "Etobicoke", province: "ON" })).toBe("Etobicoke, ON");
    expect(formatProposalAddress({})).toBeNull();
    expect(formatProposalAddress({ street_address: "  ", city: null })).toBeNull();
  });

  it("does not repeat a street, province or postal code that an imported full-address city already contains", () => {
    expect(formatProposalAddress({ street_address: "2001 Albion Rd #1", city: "2001 Albion Rd #1, Etobicoke, ON M9W 6V6, Canada", province: "ON", postal_code: "M9W 6V6" })).toBe(
      "2001 Albion Rd #1, Etobicoke, ON M9W 6V6, Canada"
    );
  });
});

describe("formatters", () => {
  it("formats North American phone numbers as +1 NNN-NNN-NNNN and leaves others as stored", () => {
    expect(formatProposalPhone("(905) 227-6336")).toBe("+1 905-227-6336");
    expect(formatProposalPhone("+1 905 227 6336")).toBe("+1 905-227-6336");
    expect(formatProposalPhone("19052276336")).toBe("+1 905-227-6336");
    expect(formatProposalPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatProposalPhone("  ")).toBeNull();
  });
  it("keeps the full website URL and adds https:// only when missing", () => {
    expect(formatProposalWebsite("https://www.boondockspetresort.com/about.html")).toBe("https://www.boondockspetresort.com/about.html");
    expect(formatProposalWebsite("boondockspetresort.com")).toBe("https://boondockspetresort.com");
    expect(formatProposalWebsite(null)).toBeNull();
  });
  it("builds the subject from the lead and the client's full name", () => {
    expect(buildProposalRequestSubject({ business_name: " Acme Pets " }, { name: " Some Client Ltd. " })).toBe("Proposal Requested – Acme Pets | Some Client Ltd.");
  });
});

describe("validateProposalRequest", () => {
  it("blocks an empty subject/body, over-long text and the unresolved [Insert …] placeholder", () => {
    expect(validateProposalRequest({ subject: "", body: "x" })).toBe("A subject is required.");
    expect(validateProposalRequest({ subject: "x", body: " " })).toBe("An email body is required.");
    expect(validateProposalRequest({ subject: "x".repeat(201), body: "x" })).toMatch(/subject is too long/);
    expect(validateProposalRequest({ subject: "x", body: "x".repeat(10001) })).toMatch(/message is too long/);
    const withPlaceholder = buildProposalRequestDraft({ client: teknokraft, lead: boondock });
    expect(validateProposalRequest(withPlaceholder)).toMatch(/placeholder/);
  });
  it("accepts a completed message", () => {
    const draft = buildProposalRequestDraft({ client: teknokraft, lead: boondock });
    const completed = { subject: draft.subject, body: draft.body.replace(PROPOSAL_REQUIREMENTS_PLACEHOLDER, "Redesign of the existing site; budget $5k–$8k; launch in 8 weeks.") };
    expect(validateProposalRequest(completed)).toBeNull();
  });
});

describe("proposal status", () => {
  it("offers exactly the six required statuses, in order", () => {
    expect(PROPOSAL_STATUSES.map((s) => s.label)).toEqual(["Not Requested", "Proposal Requested", "In Preparation", "Proposal Sent", "Accepted", "Declined"]);
    expect(isProposalStatus("proposal_sent")).toBe(true);
    expect(isProposalStatus("sent")).toBe(false);
    expect(proposalStatusLabel(undefined)).toBe("Not Requested");
  });

  it("emailing the client only ever means 'Proposal Requested' - never 'Proposal Sent'", () => {
    expect(nextStatusAfterRequest(null)).toBe("proposal_requested");
    expect(nextStatusAfterRequest("not_requested")).toBe("proposal_requested");
    expect(nextStatusAfterRequest("declined")).toBe("proposal_requested");
    expect(nextStatusAfterRequest("proposal_requested")).toBe("proposal_requested");
    // Only a proposal that is ALREADY marked sent can stay "Proposal Sent"; no other starting point can become it.
    for (const status of PROPOSAL_STATUSES) {
      if (status.key !== "proposal_sent") expect(nextStatusAfterRequest(status.key)).not.toBe("proposal_sent");
    }
  });

  it("never regresses a proposal that is further along", () => {
    for (const status of ["in_preparation", "proposal_sent", "accepted"] as const) expect(nextStatusAfterRequest(status)).toBe(status);
  });

  it("detects a request that has already been emailed", () => {
    expect(hasActiveProposalRequest(null)).toBe(false);
    expect(hasActiveProposalRequest({ status: "not_requested", request_count: 1 })).toBe(false);
    expect(hasActiveProposalRequest({ status: "proposal_requested", request_count: 0 })).toBe(false);
    expect(hasActiveProposalRequest({ status: "in_preparation", request_count: 1 })).toBe(true);
  });

  it("summarizes counts per status for the Admin dashboard", () => {
    const counts = summarizeProposals([{ status: "proposal_requested" }, { status: "proposal_requested" }, { status: "accepted" }, { status: "not_requested" }, { status: "declined" }]);
    expect(counts).toEqual({ proposal_requested: 2, in_preparation: 0, proposal_sent: 0, accepted: 1, declined: 1 });
  });
});
