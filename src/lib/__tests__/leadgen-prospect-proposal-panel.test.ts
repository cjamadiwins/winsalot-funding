import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/leadgen/admin/(dashboard)/leads/[id]/proposal-prospect-actions", () => ({
  prepareProspectProposalAction: async () => ({}),
  sendProspectProposalAction: async () => ({}),
}));

import ProspectProposalPanel, { type ProspectProposalView } from "../../components/leadgen/ProspectProposalPanel";

const view = (over: Partial<ProspectProposalView> = {}): ProspectProposalView => ({
  id: "p1",
  status: "draft",
  title: "T",
  to: "ilias@ilvplumbing.com",
  subject: "Proposal for ILV Plumbing Services from Teknokraft Canada Inc.",
  body: "Hi Ilias,\n\nThank you.",
  filename: "Teknokraft-Proposal-ILV-Plumbing-Services.pdf",
  preparedAt: "2026-11-12T00:00:00Z",
  sentAt: null,
  sections: ["1. Website development and improvement"],
  ...over,
});
const render = (proposal: ProspectProposalView | null, leadEmail: string | null = "ilias@ilvplumbing.com") => renderToStaticMarkup(createElement(ProspectProposalPanel, { leadId: "lead-1", clientName: "Teknokraft Canada Inc.", leadEmail, proposal }));

describe("Admin prospect proposal panel", () => {
  it("offers to prepare a draft when none exists (and needs an email)", () => {
    expect(render(null)).toContain("Prepare proposal draft");
    expect(render(null)).not.toMatch(/<button[^>]*disabled=""[^>]*>Prepare proposal draft/);
    expect(render(null, null)).toMatch(/<button[^>]*disabled=""[^>]*>Prepare proposal draft/);
    expect(render(null, null)).toContain("no email address");
  });

  it("shows the draft for review: recipient, subject, attachment, PDF links and the email text, not sent", () => {
    const html = render(view());
    expect(html).toContain("Draft · not sent");
    expect(html).toContain("ilias@ilvplumbing.com");
    expect(html).toContain("Proposal for ILV Plumbing Services from Teknokraft Canada Inc.");
    expect(html).toContain("Teknokraft-Proposal-ILV-Plumbing-Services.pdf");
    expect(html).toContain('href="/leadgen/admin/leads/lead-1/proposal-pdf"');
    expect(html).toContain("proposal-pdf?download=1");
    expect(html).toContain("Hi Ilias,");
    expect(html).toContain("Nothing is emailed until you send it");
  });

  it("the Send button starts disabled until the Admin ticks the review box", () => {
    const html = render(view());
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send to ilias@ilvplumbing\.com<\/button>/);
    expect(html).toContain("I reviewed the proposal PDF and the email");
  });

  it("a sent proposal shows no send controls", () => {
    const html = render(view({ status: "sent", sentAt: "2026-11-12T10:00:00Z" }));
    expect(html).toContain("Sent");
    expect(html).not.toContain("Send to ilias@ilvplumbing.com");
    expect(html).not.toContain("I reviewed the proposal PDF");
  });
});
