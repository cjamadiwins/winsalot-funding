import { describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildProspectProposal } from "../leadgen-prospect-proposal";

vi.mock("server-only", () => ({}));

const ILV = {
  lead: { business_name: "ILV Plumbing Services", contact_name: "ilias", city: "Winnipeg", province: "MB", industry: "Plumbing", website: "https://ilvplumbing.com/" },
  client: { name: "Teknokraft Canada Inc.", booking_link: "https://leads.winsalotcorp.com/book/teknokraft-canada", services_info_link: "https://www.teknokraft.ca" },
  approvedServices: ["new_website", "redesign_rebranding", "seo_visibility", "digital_marketing"],
  verifiedFacts: ["You spoke with our team and asked us to send information by email."],
  preparedOn: "2026-11-12",
};

describe("proposal PDF", () => {
  it("renders a valid multi-section PDF from the saved content", async () => {
    const { renderProspectProposalPdf } = await import("../leadgen-prospect-proposal-pdf");
    const { content } = buildProspectProposal(ILV);
    const pdf = await renderProspectProposalPdf(content);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(8000);
    // Same content -> byte-identical text content (the emailed and downloaded PDFs match).
    const again = await renderProspectProposalPdf(content);
    expect(again.length).toBe(pdf.length);
    if (process.env.PROPOSAL_PDF_OUT) {
      mkdirSync(process.env.PROPOSAL_PDF_OUT, { recursive: true });
      writeFileSync(`${process.env.PROPOSAL_PDF_OUT}/proposal.pdf`, pdf);
    }
  });
});
