import { describe, expect, it } from "vitest";
import { deriveEmailMarketingStatus, isEligibleForEmailMarketing } from "../crm-email-marketing-status";

const eligibleStage = "Interested";
const email = "prospect@example.com";

describe("Growth CRM Email Marketing status", () => {
  it("is Unsubscribed whenever the recipient is suppressed, regardless of enrollment status", () => {
    expect(
      deriveEmailMarketingStatus({ stage: eligibleStage, email, isSuppressed: true, enrollmentStatus: "active" })
    ).toBe("unsubscribed");
    expect(
      deriveEmailMarketingStatus({ stage: eligibleStage, email, isSuppressed: true, enrollmentStatus: null })
    ).toBe("unsubscribed");
  });

  it("is Unsubscribed when the enrollment itself was stopped by an unsubscribe (e.g. a bounce/complaint)", () => {
    expect(
      deriveEmailMarketingStatus({ stage: eligibleStage, email, isSuppressed: false, enrollmentStatus: "unsubscribed" })
    ).toBe("unsubscribed");
  });

  it("is Enrolled for an active or paused enrollment", () => {
    expect(deriveEmailMarketingStatus({ stage: eligibleStage, email, isSuppressed: false, enrollmentStatus: "active" })).toBe(
      "enrolled"
    );
    expect(deriveEmailMarketingStatus({ stage: eligibleStage, email, isSuppressed: false, enrollmentStatus: "paused" })).toBe(
      "enrolled"
    );
  });

  it("is Consent Required for an eligible business that has never been enrolled (or was stopped/removed)", () => {
    expect(deriveEmailMarketingStatus({ stage: eligibleStage, email, isSuppressed: false, enrollmentStatus: null })).toBe(
      "consent_required"
    );
    expect(deriveEmailMarketingStatus({ stage: eligibleStage, email, isSuppressed: false, enrollmentStatus: "stopped" })).toBe(
      "consent_required"
    );
  });

  it("is Not Enrolled for a business that isn't eligible yet - wrong stage or no email on file", () => {
    expect(
      deriveEmailMarketingStatus({ stage: "New Prospect", email, isSuppressed: false, enrollmentStatus: null })
    ).toBe("not_enrolled");
    expect(
      deriveEmailMarketingStatus({ stage: "Client Won", email, isSuppressed: false, enrollmentStatus: null })
    ).toBe("not_enrolled");
    expect(
      deriveEmailMarketingStatus({ stage: eligibleStage, email: null, isSuppressed: false, enrollmentStatus: null })
    ).toBe("not_enrolled");
    expect(
      deriveEmailMarketingStatus({ stage: eligibleStage, email: "   ", isSuppressed: false, enrollmentStatus: null })
    ).toBe("not_enrolled");
  });

  it("never auto-enrolls: a fresh prospect with no enrollment history is Not Enrolled, not Enrolled", () => {
    expect(isEligibleForEmailMarketing({ stage: "New Prospect", email })).toBe(false);
    expect(
      deriveEmailMarketingStatus({ stage: "New Prospect", email, isSuppressed: false, enrollmentStatus: null })
    ).not.toBe("enrolled");
  });
});
