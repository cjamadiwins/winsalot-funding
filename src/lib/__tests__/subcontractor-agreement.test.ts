import { describe, expect, it } from "vitest";
import { buildSubcontractorAgreementText } from "@/lib/subcontractor-agreement";

describe("subcontractor agreement", () => {
  it("snapshots the contractor name, currency, rate and relationship terms", () => {
    const text = buildSubcontractorAgreementText({ full_name: "Jane Doe", currency: "PHP", pay_type: "hourly", pay_rate: 25 });
    expect(text).toContain("Jane Doe");
    expect(text).toContain("PHP");
    expect(text).toContain("25");
    expect(text).toContain("independent contractor and not an employee");
    expect(text).toContain("CONFIDENTIALITY, PRIVACY, AND SECURITY");
    expect(text).toContain("Ontario");
  });
});
