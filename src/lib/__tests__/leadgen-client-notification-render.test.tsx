import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ClientNotificationModal from "@/components/leadgen/ClientNotificationModal";
import CommunicationPreferenceBanner from "@/components/leadgen/CommunicationPreferenceBanner";
import type { LeadgenClientRow, LeadgenLeadRow } from "@/lib/leadgen-types";

const mak = {
  id: "mak",
  business_name: "Mak 7even Renovations",
  contact_name: "Mak",
  email: "mak7ltd@gmail.com",
  phone: "14379710790",
  website: "http://mak7ltd.com",
  industry: "Renovations",
  city: "14 Foundry Ave #216, Toronto, ON M6H 0A8, Canada General contractor",
  province: null,
  status: "Interested",
  notes: "The client requests a detailed proposal via email outlining the scope of work, costs, and the duration, excluding advertising expenses.",
  client_notes: null,
  source_notes: null,
} as unknown as LeadgenLeadRow;
const teknokraft = { id: "c", name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true, contact_name: "Shahbaz Anjum", contact_email: "shahbaz.anjum@teknokraft.ca" } as unknown as LeadgenClientRow;

const render = (client: LeadgenClientRow, lead: LeadgenLeadRow) =>
  renderToStaticMarkup(<ClientNotificationModal lead={lead} client={client} onClose={vi.fn()} onSend={vi.fn()} onSent={vi.fn()} />);

describe("Email Client composer", () => {
  const html = render(teknokraft, mak);

  it("shows the client recipient, client email, and every prefilled lead field", () => {
    for (const text of ["Email Client", "Teknokraft Canada Inc. (Shahbaz Anjum)", "shahbaz.anjum@teknokraft.ca", "Mak 7even Renovations", "mak7ltd@gmail.com", "+1 437 971 0790", "mak7ltd.com", "Renovations / General Contractor", "Toronto, ON", "Interested"]) {
      expect(html).toContain(text);
    }
  });

  it("surfaces EMAIL ONLY — DO NOT CALL prominently", () => {
    expect(html).toContain("EMAIL ONLY — DO NOT CALL");
  });

  it("prefills an editable subject and body, the type list, and Send / Cancel", () => {
    expect(html).toContain("Interested Lead – Mak 7even Renovations – Proposal Requested");
    expect(html).toContain("Hi Teknokraft team,");
    expect(html).toContain("<textarea");
    for (const label of ["Interested Lead", "Proposal Requested", "Appointment Requested", "Callback / Client Follow-up Required", "Additional Information Requested", "Custom"]) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(/>Send<\/button>/);
    expect(html).toContain("Cancel");
  });

  it("disables Send and explains why when the client has no contact email", () => {
    const noEmail = render({ ...teknokraft, contact_email: null } as LeadgenClientRow, mak);
    expect(noEmail).toContain("No contact email is saved for Teknokraft Canada Inc.");
    expect(noEmail).toMatch(/<button[^>]*disabled[^>]*>Send<\/button>/);
  });

  it("shows no email-only banner for a lead whose notes don't say so", () => {
    const other = render(teknokraft, { ...mak, notes: "Owner busy, try next week." } as LeadgenLeadRow);
    expect(other).not.toContain("EMAIL ONLY");
  });
});

describe("lead-page banner", () => {
  it("shows for Mak and quotes his note; renders nothing otherwise", () => {
    const html = renderToStaticMarkup(<CommunicationPreferenceBanner lead={mak} />);
    expect(html).toContain("EMAIL ONLY — DO NOT CALL");
    expect(html).toContain("detailed proposal via email");
    expect(renderToStaticMarkup(<CommunicationPreferenceBanner lead={{ ...mak, notes: null }} />)).toBe("");
  });
});
