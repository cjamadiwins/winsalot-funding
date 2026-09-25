import { describe, expect, it } from "vitest";
import { leadgenHomeForRole, normalizeLeadgenRole } from "../leadgen-role";

describe("Lead Generation CRM role routing", () => {
  it("normalizes valid application roles and selects only their own dashboard", () => {
    expect(leadgenHomeForRole(normalizeLeadgenRole(" Admin ")!)).toBe("/leadgen/admin");
    expect(leadgenHomeForRole(normalizeLeadgenRole("AGENT")!)).toBe("/leadgen/agent");
    expect(leadgenHomeForRole(normalizeLeadgenRole("client")!)).toBe("/client/dashboard");
  });

  it("never resolves a missing or unknown role to a client", () => {
    for (const value of [null, undefined, "", "viewer", "admin client", 1]) {
      expect(normalizeLeadgenRole(value)).toBeNull();
    }
  });
});
