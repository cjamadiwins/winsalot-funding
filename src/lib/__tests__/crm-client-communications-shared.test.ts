import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_SETUP_SUBJECT,
  RESENDABLE_CLIENT_COMM_TYPES,
  buildCampaignSetupDraft,
  categorizeInvoiceEmail,
  categorizeLeadEmail,
  categorizeLeadgenEmail,
  communicationStatusLabel,
  redactSecureLinks,
  sortCommunications,
  type ClientCommunicationEntry,
} from "../crm-client-communications-shared";

const entry = (key: string, sentAt: string): ClientCommunicationEntry => ({
  key,
  source: "client_comm",
  id: key,
  sentAt,
  recipient: "a@b.c",
  subject: key,
  category: "Client update",
  sender: "Winsalot Corp.",
  status: "sent",
  related: null,
  hasContent: true,
  canResend: false,
  resendNote: null,
});

describe("Communication History helpers", () => {
  it("sorts most recent first, across sources, with a stable tie-break", () => {
    const sorted = sortCommunications([entry("b", "2026-09-28T10:00:00Z"), entry("c", "2026-09-29T12:00:00Z"), entry("a", "2026-09-28T10:00:00Z")]);
    expect(sorted.map((e) => e.key)).toEqual(["c", "a", "b"]);
  });

  it("only allows resending the types that are safe to duplicate (always behind confirmation)", () => {
    expect([...RESENDABLE_CLIENT_COMM_TYPES].sort()).toEqual(["campaign_setup", "client_update", "payment_receipt"]);
    expect(RESENDABLE_CLIENT_COMM_TYPES.has("agreement_sent")).toBe(false);
    expect(RESENDABLE_CLIENT_COMM_TYPES.has("intake_form")).toBe(false);
  });

  it("hides one-time secure links from stored bodies", () => {
    expect(redactSecureLinks("https://leads.winsalotcorp.com/client/auth/callback?token_hash=abc123&type=recovery")).toContain("token_hash=[hidden]");
    expect(redactSecureLinks("Sign here: https://growth.winsalotcorp.com/agreement-sign/SECRET")).not.toContain("SECRET");
    expect(redactSecureLinks("Intake: https://growth.winsalotcorp.com/client-intake/SECRET2")).not.toContain("SECRET2");
    expect(redactSecureLinks("Plain text with no links")).toBe("Plain text with no links");
  });

  it("categorizes emails from the existing tables", () => {
    expect(categorizeLeadgenEmail(null, "Your Winsalot Client Portal is ready")).toBe("Client portal invitation");
    expect(categorizeLeadgenEmail(null, "Reset your Winsalot Client Portal access")).toBe("Client portal invitation");
    expect(categorizeLeadgenEmail("monthly_report", "Your July results")).toBe("Campaign report");
    expect(categorizeLeadEmail("consultation_confirmation")).toBe("Appointment / consultation");
    expect(categorizeInvoiceEmail("invoice_receipt")).toBe("Payment receipt");
    expect(categorizeInvoiceEmail("invoice_reminder")).toBe("Renewal / payment request");
  });

  it("labels delivery status, and says so when it isn't tracked", () => {
    expect(communicationStatusLabel("delivered")).toBe("Delivered");
    expect(communicationStatusLabel("complained")).toBe("Marked as spam");
    expect(communicationStatusLabel(null)).toBe("Not tracked");
  });
});

describe("campaign setup email draft", () => {
  const draft = buildCampaignSetupDraft({
    contactName: "Theodore",
    companyName: "Hidebrandt Web Services",
    campaignName: "Hidebrandt Web Services – Website Services Lead Generation",
    service: "B2B Lead Generation",
    campaignStartDate: "2026-09-29",
    depositReceivedLabel: "CA$250.00",
  });

  it("uses the exact required subject", () => {
    expect(draft.subject).toBe("Your Winsalot Corp. Campaign Setup Is Complete");
    expect(CAMPAIGN_SETUP_SUBJECT).toBe(draft.subject);
  });

  it("is built only from the client's record and brands the company as 'Winsalot Corp.'", () => {
    expect(draft.message).toContain("Hi Theodore,");
    expect(draft.message).toContain("Hidebrandt Web Services");
    expect(draft.message).toContain("September 29, 2026");
    expect(draft.message).toContain("CA$250.00 received");
    expect(draft.message).not.toMatch(/Winsalot Corp(?!\.)/);
  });

  it("omits facts it doesn't have instead of inventing them", () => {
    const bare = buildCampaignSetupDraft({ contactName: null, companyName: "Acme", campaignName: null, service: null, campaignStartDate: null, depositReceivedLabel: null });
    expect(bare.message).toContain("Hi there,");
    expect(bare.message).not.toContain("start date");
    expect(bare.message).not.toContain("deposit");
  });
});
