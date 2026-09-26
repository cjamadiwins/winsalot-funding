import { describe, expect, it } from "vitest";
import { buildApprovedVoicemailScript, getApprovedVoicemailPhone } from "@/lib/approved-voicemail";

describe("approved voicemail identity mapping", () => {
  it("assigns the admin callback number", () => {
    expect(getApprovedVoicemailPhone({ email: "info@winsalotcorp.com", fullName: "C.J Amadi", role: "admin" })).toBe("647-557-9186");
  });

  it("assigns Henry's callback number using the exact account email", () => {
    expect(getApprovedVoicemailPhone({ email: "agent@winsalotcorp.com", fullName: "Henry Osuji", role: "agent" })).toBe("647-692-9444");
  });

  it("assigns Goodness's callback number using the exact account email", () => {
    expect(getApprovedVoicemailPhone({ email: "agent2@winsalotcorp.com", fullName: "Goodness Ugbana", role: "agent" })).toBe("647-499-3706");
  });

  it("uses the resolved name and number in the copied script content", () => {
    const phone = getApprovedVoicemailPhone({ email: "agent1@winsalotcorp.com", fullName: "Henry Osuji", role: "agent" });
    expect(phone).toBe("647-692-9444");
    const script = buildApprovedVoicemailScript("Henry Osuji", phone!);
    expect(script).toContain("Hi, this is Henry Osuji calling from Winsalot Corp.");
    expect(script).toContain("return my call at 647-692-9444.");
    expect(script).not.toContain("[Agent Phone Number]");
  });

  it("does not loosely match an unknown profile by a partial name", () => {
    expect(getApprovedVoicemailPhone({ email: "henry.other@winsalotcorp.com", fullName: "Henry", role: "agent" })).toBeNull();
  });
});
