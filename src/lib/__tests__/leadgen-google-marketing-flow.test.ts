import { describe, expect, it, vi } from "vitest";
import { EMPTY_ANSWERS, GOOGLE_MARKETING_FIELDS, buildQualificationBriefLines, normalizeAnswers, type QualificationAnswers } from "../leadgen-qualification";

vi.mock("server-only", () => ({}));

// What an agent's clicks produce -> what the save action writes -> what the
// database returns -> what the appointment preparation brief shows.
const clicks: Partial<QualificationAnswers> = {
  google_interest: "yes",
  google_visibility: "no",
  ai_search_interest: "more",
  investing_marketing: "unsure",
  specialist_interest: "yes",
  has_website: "yes",
  services_of_interest: ["seo_visibility", "human_search_optimization", "digital_marketing"],
};

describe("Google marketing answers: save -> read back -> appointment brief", () => {
  it("round-trips through the stored row and lands in the brief", async () => {
    const { rowToQualification } = await import("../leadgen-appointment-qc");
    const saved = normalizeAnswers(clicks);
    // Mirrors qualification-actions: unused Google columns are omitted from the write.
    const written: Record<string, unknown> = { ...saved };
    for (const f of GOOGLE_MARKETING_FIELDS) if (saved[f] === null) delete written[f];
    expect(written.google_interest).toBe("yes");
    expect(written.online_customers_satisfied).toBeUndefined();

    const record = rowToQualification({ id: "q1", lead_id: "l1", client_id: "c1", updated_at: "2026-11-11T00:00:00Z", outcome: "qualified", ...written });
    expect(record).toMatchObject({ google_interest: "yes", google_visibility: "no", ai_search_interest: "more", investing_marketing: "unsure", specialist_interest: "yes" });
    expect(record.services_of_interest).toEqual(clicks.services_of_interest);

    const brief = buildQualificationBriefLines({ answers: record, verified: true, prospectName: "Pat", businessName: "Pat Plumbing", appointmentDate: "2026-11-20", appointmentTime: "10:00:00", timezone: "America/Toronto", agentName: "Goodness", leadWebsite: null }).join("\n");
    expect(brief).toContain("Marketing services of interest: SEO and online visibility, Human search optimization, Digital marketing");
    expect(brief).toContain("Google ranking interest: Interested in ranking higher on Google");
    expect(brief).toContain("Wants to be easier to discover through Google and AI-powered search: Wants to know more");
    expect(brief).toContain("Wants to speak with a specialist: Yes");
  });

  it("a lead with no Google answers (other clients, older leads) gets an unchanged brief", () => {
    const brief = buildQualificationBriefLines({ answers: { ...EMPTY_ANSWERS, services_of_interest: ["new_website"] }, verified: true, prospectName: null, businessName: "X", appointmentDate: "2026-11-20", appointmentTime: "10:00:00", timezone: "America/Toronto", agentName: null, leadWebsite: null }).join("\n");
    expect(brief).not.toContain("Google visibility and marketing");
  });
});
