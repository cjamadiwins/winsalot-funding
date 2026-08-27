import { afterEach, describe, expect, it } from "vitest";
import { getEmailReplyTo, getEmailSender, senderForOpportunityType } from "../email-senders";

const OVERRIDE_VARS = ["GROWTH_EMAIL_FROM", "FUNDING_EMAIL_FROM", "BILLING_EMAIL_FROM", "QUOTES_EMAIL_FROM", "EMAIL_REPLY_TO"] as const;

afterEach(() => {
  for (const key of OVERRIDE_VARS) delete process.env[key];
});

describe("getEmailSender", () => {
  it("uses the correct default identity for every category - growth/funding share the Lead Gen CRM's already-trusted info@ address, billing/quotes keep their own", () => {
    expect(getEmailSender("growth")).toBe("C.J. at Winsalot Corp <info@winsalotcorp.com>");
    expect(getEmailSender("funding")).toBe("C.J. at Winsalot Corp <info@winsalotcorp.com>");
    expect(getEmailSender("billing")).toBe("C.J. at Winsalot Corp <billing@winsalotcorp.com>");
    expect(getEmailSender("quotes")).toBe("C.J. at Winsalot Corp <quotes@winsalotcorp.com>");
  });

  it("never returns the quotes@ identity for growth, funding, or billing", () => {
    for (const category of ["growth", "funding", "billing"] as const) {
      expect(getEmailSender(category)).not.toContain("quotes@winsalotcorp.com");
    }
  });

  it("each category's override is isolated - setting one never changes another", () => {
    process.env.GROWTH_EMAIL_FROM = "Custom Growth <custom-growth@winsalotcorp.com>";
    expect(getEmailSender("growth")).toBe("Custom Growth <custom-growth@winsalotcorp.com>");
    expect(getEmailSender("funding")).toBe("C.J. at Winsalot Corp <info@winsalotcorp.com>");
    expect(getEmailSender("billing")).toBe("C.J. at Winsalot Corp <billing@winsalotcorp.com>");
    expect(getEmailSender("quotes")).toBe("C.J. at Winsalot Corp <quotes@winsalotcorp.com>");
  });
});

describe("getEmailReplyTo", () => {
  it("defaults to info@winsalotcorp.com", () => {
    expect(getEmailReplyTo()).toBe("info@winsalotcorp.com");
  });

  it("respects an explicit EMAIL_REPLY_TO override", () => {
    process.env.EMAIL_REPLY_TO = "someone-else@winsalotcorp.com";
    expect(getEmailReplyTo()).toBe("someone-else@winsalotcorp.com");
  });
});

describe("senderForOpportunityType", () => {
  it("uses the Growth identity for lead_generation and both_services", () => {
    expect(senderForOpportunityType("lead_generation")).toBe(getEmailSender("growth"));
    expect(senderForOpportunityType("both_services")).toBe(getEmailSender("growth"));
  });

  it("uses the Funding identity for business_financing", () => {
    expect(senderForOpportunityType("business_financing")).toBe(getEmailSender("funding"));
  });

  it("never sends a business_financing opportunity email from the Cleaning identity, and still routes through the Funding category even if a Growth override is set", () => {
    process.env.GROWTH_EMAIL_FROM = "Custom Growth <custom-growth@winsalotcorp.com>";
    const sender = senderForOpportunityType("business_financing");
    expect(sender).not.toContain("custom-growth@winsalotcorp.com");
    expect(sender).not.toContain("quotes@winsalotcorp.com");
  });
});
