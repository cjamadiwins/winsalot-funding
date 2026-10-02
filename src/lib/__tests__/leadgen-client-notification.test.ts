import { describe, expect, it } from "vitest";
import {
  buildClientNotificationDraft,
  clientGreetingName,
  clientNotifiedActivityNotes,
  defaultNotificationType,
  detectCommunicationPreferences,
  detectProposalRequest,
  formatLeadPhone,
  isClientNotificationType,
  leadIndustryDisplay,
  parseLeadLocation,
  resolveClientNotificationRecipient,
  EMAIL_ONLY_LABEL,
} from "../leadgen-client-notification";
import type { LeadgenLeadRow } from "../leadgen-types";

// Mirrors the production Mak 7even Renovations record (Teknokraft).
const mak = {
  id: "4db7407b-baf1-4b5c-b055-510897a0f8b7",
  business_name: "Mak 7even Renovations",
  contact_name: "Mak",
  decision_maker_name: "Mak",
  email: "mak7ltd@gmail.com",
  phone: "14379710790",
  website: "http://mak7ltd.com",
  industry: "Renovations",
  city: "14 Foundry Ave #216, Toronto, ON M6H 0A8, Canada General contractor",
  province: null,
  status: "Interested",
  notes: "The client requests a detailed proposal via email outlining the scope of work, costs, and the duration, excluding advertising expenses.\n\nEMAIL ONLY — DO NOT CALL",
  client_notes: null,
  source_notes: null,
} as unknown as LeadgenLeadRow;

const teknokraft = { name: "Teknokraft Canada Inc.", slug: "teknokraft-canada" };

describe("Mak 7even Renovations (Teknokraft) draft", () => {
  it("defaults to Proposal Requested with the requested subject", () => {
    expect(defaultNotificationType(mak)).toBe("proposal_requested");
    expect(buildClientNotificationDraft({ client: teknokraft, lead: mak, type: "proposal_requested" }).subject).toBe(
      "Interested Lead – Mak 7even Renovations – Proposal Requested",
    );
  });

  it("builds the requested body, populating verified lead data instead of hardcoding it", () => {
    const { body } = buildClientNotificationDraft({ client: teknokraft, lead: mak, type: "proposal_requested" });
    expect(body).toBe(
      [
        "Hi Teknokraft team,",
        "Mak 7even Renovations has expressed interest in website services and has requested a detailed proposal by email.",
        "They would like the proposal to include:\n• Scope of work\n• Project cost\n• Estimated project duration / completion timeline",
        "Lead details:\nBusiness: Mak 7even Renovations\nContact: Mak\nEmail: mak7ltd@gmail.com\nPhone: +1 437 971 0790\nWebsite: mak7ltd.com\nIndustry: Renovations / General Contractor\nLocation: Toronto, ON",
        "Please follow up with the prospect directly. Once contact has been made, please update us on the outcome so we can keep the campaign record current.",
        "Regards,\nWinsalot Corp.",
      ].join("\n\n"),
    );
  });

  it("shows the Winsalot-side warning, quoting the lead note it came from", () => {
    const prefs = detectCommunicationPreferences(mak);
    expect(prefs).toHaveLength(1);
    expect(EMAIL_ONLY_LABEL).toBe("WINSALOT: EMAIL ONLY — DO NOT CALL");
    expect(prefs[0].label).toBe(EMAIL_ONLY_LABEL);
    expect(prefs[0].evidence).toBe("EMAIL ONLY — DO NOT CALL");
  });

  it("the Teknokraft-facing handoff contains no call restriction, but still says the proposal was requested by email", () => {
    for (const type of ["proposal_requested", "interested_lead", "callback_follow_up", "additional_information", "appointment_requested", "custom"] as const) {
      const { subject, body } = buildClientNotificationDraft({ client: teknokraft, lead: mak, type });
      expect(`${subject}\n${body}`).not.toMatch(/do\s*not\s*call|don'?t\s*call|email\s+only|email communication only|no phone call|prohibit|winsalot:/i);
    }
    const { body } = buildClientNotificationDraft({ client: teknokraft, lead: mak, type: "proposal_requested" });
    expect(body).toContain("has requested a detailed proposal by email.");
    expect(body).toContain("• Scope of work\n• Project cost\n• Estimated project duration / completion timeline");
  });

  it("without the explicit note, the 'via email' request alone does not trigger the internal warning", () => {
    const withoutNote = { ...mak, notes: "The client requests a detailed proposal via email outlining the scope of work, costs, and the duration." } as LeadgenLeadRow;
    expect(detectCommunicationPreferences(withoutNote)).toEqual([]);
    expect(buildClientNotificationDraft({ client: teknokraft, lead: withoutNote, type: "proposal_requested" }).body).toContain("by email.");
  });
});

describe("email-only is per lead, never global", () => {
  const plain = { ...mak, id: "other", business_name: "Plain Plumbing", notes: "Owner said call back Tuesday.", status: "Interested" } as LeadgenLeadRow;
  it("another Teknokraft lead without that note is not email-only", () => {
    expect(detectCommunicationPreferences(plain)).toEqual([]);
    const { body } = buildClientNotificationDraft({ client: teknokraft, lead: plain, type: "interested_lead" });
    expect(body).not.toMatch(/email communication only|by email/i);
    expect(body).toContain("Please follow up with the prospect directly.");
  });
  it.each([
    ["Prefers email only, no calls.", "email_only"],
    ["Please do not call, email instead.", "email_only"],
    ["Don't call him.", "email_only"],
    ["Call me back after 3pm.", "specific_time"],
    ["Please call tomorrow", "call_requested"],
  ])("detects %s", (notes, kind) => {
    expect(detectCommunicationPreferences({ status: "Interested", notes, client_notes: null, source_notes: null }).map((p) => p.kind)).toContain(kind);
  });
  it("treats a Do not call status as a call restriction", () => {
    expect(detectCommunicationPreferences({ status: "Do not call", notes: null, client_notes: null, source_notes: null })[0].label).toBe(EMAIL_ONLY_LABEL);
  });
});

describe("generic client (not Teknokraft)", () => {
  const brent = { name: "Brent's Essentials", slug: "brentsessentials" };
  const lead = { ...mak, id: "x", business_name: "Joe's Auto", industry: "Auto Repair", city: "Toronto", province: "ON", notes: null, status: "Callback requested" } as LeadgenLeadRow;
  it("works for any client and reason", () => {
    expect(defaultNotificationType(lead)).toBe("callback_follow_up");
    const { subject, body } = buildClientNotificationDraft({ client: brent, lead, type: "callback_follow_up" });
    expect(subject).toBe("Interested Lead – Joe's Auto – Callback / Client Follow-up Required");
    expect(body.startsWith("Hi Brent's Essentials team,")).toBe(true);
    expect(body).toContain("regarding your services");
    expect(body).toContain("Location: Toronto, ON");
  });
  it("subject variants", () => {
    expect(buildClientNotificationDraft({ client: brent, lead, type: "interested_lead" }).subject).toBe("Interested Lead – Joe's Auto");
    expect(buildClientNotificationDraft({ client: brent, lead, type: "custom" }).subject).toBe("Lead Update – Joe's Auto");
  });
});

describe("recipient resolution", () => {
  it("uses the client's own contact email", () => {
    expect(resolveClientNotificationRecipient({ name: "Teknokraft Canada Inc.", contact_name: "Shahbaz Anjum", contact_email: " shahbaz.anjum@teknokraft.ca " })).toEqual({
      recipient: { email: "shahbaz.anjum@teknokraft.ca", name: "Shahbaz Anjum" },
    });
  });
  it("errors clearly when there is no usable address", () => {
    expect(resolveClientNotificationRecipient({ name: "X", contact_name: null, contact_email: null })).toHaveProperty("error");
    expect(resolveClientNotificationRecipient({ name: "X", contact_name: null, contact_email: "nope" })).toHaveProperty("error");
  });
});

describe("helpers", () => {
  it("greeting name drops legal suffix and country", () => {
    expect(clientGreetingName("Teknokraft Canada Inc.")).toBe("Teknokraft");
    expect(clientGreetingName("Hidebrandt Web Services")).toBe("Hidebrandt Web Services");
    expect(clientGreetingName("Web6 Solutions")).toBe("Web6 Solutions");
    expect(clientGreetingName("Inc.")).toBe("Inc.");
  });
  it("splits an imported address+category city and cleans phone", () => {
    expect(parseLeadLocation(mak)).toEqual({ location: "Toronto, ON", category: "General Contractor" });
    expect(parseLeadLocation({ city: "Ottawa", province: "ON" })).toEqual({ location: "Ottawa, ON", category: null });
    expect(parseLeadLocation({ city: null, province: null })).toEqual({ location: null, category: null });
    expect(leadIndustryDisplay(mak)).toBe("Renovations / General Contractor");
    expect(formatLeadPhone("14379710790")).toBe("+1 437 971 0790");
    expect(formatLeadPhone("4165551234")).toBe("416 555 1234");
    expect(formatLeadPhone(null)).toBeNull();
  });
  it("detects requested proposal items only when mentioned", () => {
    expect(detectProposalRequest({ notes: "wants a quote", client_notes: null })).toEqual({ requested: true, items: ["Project cost"], viaEmail: false });
    expect(detectProposalRequest({ notes: "call back", client_notes: null })).toEqual({ requested: false, items: [], viaEmail: false });
  });
  it("validates types and writes a clear timeline entry", () => {
    expect(isClientNotificationType("proposal_requested")).toBe(true);
    expect(isClientNotificationType("status_change")).toBe(false);
    const notes = clientNotifiedActivityNotes({ type: "proposal_requested", clientName: "Teknokraft Canada Inc.", toEmail: "a@b.ca", subject: "S", sentBy: "Admin" });
    expect(notes.split("\n")[0]).toBe("Client notified – Proposal Requested");
  });
});
