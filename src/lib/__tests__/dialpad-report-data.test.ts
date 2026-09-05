import { describe, expect, it } from "vitest";
import { resolveIdentity } from "../dialpad-report-data";

describe("Dialpad identity resolution", () => {
  it("prefers the curated DIALPAD_IDENTITIES name over a generic company placeholder in the real directory", () => {
    // Regression test: info@winsalotcorp.com's crm_users row has full_name
    // equal to its own email (no one renamed it), and its leadgen_users row
    // has full_name "Winsalot Corp" - a generic company name, not a real
    // per-person name, but different enough from the email that an earlier
    // version of this function mistook it for "the real directory has a
    // better name" and used it instead of the curated "C.J Amadi".
    const identity = resolveIdentity(
      { agentName: "Winsalot Corp.", agentEmail: "info@winsalotcorp.com" },
      [
        { full_name: "info@winsalotcorp.com", email: "info@winsalotcorp.com", role: "admin", active: true },
        { full_name: "Winsalot Corp", email: "info@winsalotcorp.com", role: "admin", active: true },
      ]
    );
    expect(identity).toEqual({ agentName: "C.J Amadi", agentRole: "admin" });
  });

  it("prefers a real, genuinely per-person directory match for a Dialpad email with no curated fallback", () => {
    const identity = resolveIdentity(
      { agentName: "Some Corp.", agentEmail: "new.agent@winsalotcorp.com" },
      [{ full_name: "Priya Shah", email: "new.agent@winsalotcorp.com", role: "agent", active: true }]
    );
    expect(identity).toEqual({ agentName: "Priya Shah", agentRole: "agent" });
  });

  it("falls back to the raw CSV name when neither a curated mapping nor a real directory match exists", () => {
    const identity = resolveIdentity({ agentName: "Unknown Caller", agentEmail: "nobody@example.com" }, []);
    expect(identity).toEqual({ agentName: "Unknown Caller", agentRole: "agent" });
  });

  it("never lets a directory row whose name is still just its own email override anything", () => {
    const identity = resolveIdentity(
      { agentName: "Some Corp.", agentEmail: "plain@winsalotcorp.com" },
      [{ full_name: "plain@winsalotcorp.com", email: "plain@winsalotcorp.com", role: "agent", active: true }]
    );
    expect(identity).toEqual({ agentName: "Some Corp.", agentRole: "agent" });
  });
});
