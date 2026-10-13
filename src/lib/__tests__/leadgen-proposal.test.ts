import { describe, expect, it } from "vitest";
import {
  PROPOSAL_REQUIREMENTS_PLACEHOLDER,
  PROPOSAL_STATUSES,
  buildProposalRequestDraft,
  buildProposalRequestSubject,
  formatProposalPhone,
  formatProposalWebsite,
  hasActiveProposalRequest,
  isProposalStatus,
  nextStatusAfterRequest,
  proposalStatusLabel,
  summarizeProposals,
  validateProposalRequest,
} from "../leadgen-proposal";
import type { LeadgenLeadRow } from "../leadgen-types";

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
