import { describe, expect, it } from "vitest";
import {
  EMPTY_ANSWERS,
  QUALIFICATION_CATEGORIES,
  QUALIFICATION_CATEGORY_LABELS,
  acceptanceRate,
  buildQcMetrics,
  buildQualificationBriefLines,
  classifyFromAnswers,
  composeRejectionReason,
  customServiceKey,
  evaluateQualifiable,
  isClientNotifiable,
  isValidServiceKey,
  missingAnswers,
  normalizeAnswers,
  preliminaryCategoryFromLead,
  rejectionReasonBucket,
  suggestOutcome,
  type QualificationAnswers,
} from "../leadgen-qualification";

const HIDEBRANDT = ["new_website", "redesign_rebranding", "ecommerce", "seo_visibility", "human_search_optimization"];
const TEKNOKRAFT = ["new_website", "redesign_rebranding", "seo_visibility"]; // e-commerce not confirmed

const complete: QualificationAnswers = {
  ...EMPTY_ANSWERS,
  has_website: "yes",
  website_url: "https://example.ca",
  interested_in_new_or_redesign: "redesign",
  satisfied_with_site: "not_satisfied",
  needs_ecommerce: "no",
  interested_in_seo: "yes",
  challenges: "Old site, not mobile friendly, no enquiries",
  understands_services: true,
  agreed_to_appointment: true,
  decision_maker: "yes" as const,
  contact_verified: true,
  appointment_confirmed: true,
  services_of_interest: ["redesign_rebranding", "seo_visibility"],
};

describe("required questions", () => {
  it("reports every unanswered mandatory question", () => {
    expect(missingAnswers(EMPTY_ANSWERS)).toHaveLength(8);
    expect(missingAnswers(complete)).toEqual([]);
    expect(missingAnswers({ ...complete, challenges: "   " })).toEqual(["challenges"]);
    expect(missingAnswers({ ...complete, agreed_to_appointment: null })).toEqual(["agreed_to_appointment"]);
  });

  it("treats 'false' answers as answered, not missing", () => {
    expect(missingAnswers({ ...complete, understands_services: false, agreed_to_appointment: false })).toEqual([]);
  });
});

describe("qualified only when every rule holds", () => {
  it("accepts a complete, understood, agreed answer set with an approved service", () => {
    expect(evaluateQualifiable(complete, HIDEBRANDT)).toEqual({ ok: true, reasons: [] });
  });

  it("rejects incomplete answers", () => {
    const r = evaluateQualifiable({ ...complete, interested_in_seo: null }, HIDEBRANDT);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/Answer every required question/);
  });

  it("rejects a prospect who does not understand the services or has not agreed", () => {
    expect(evaluateQualifiable({ ...complete, understands_services: false }, HIDEBRANDT).ok).toBe(false);
    expect(evaluateQualifiable({ ...complete, agreed_to_appointment: false }, HIDEBRANDT).ok).toBe(false);
  });

  it("rejects lead-generation-only prospects even if everything else is filled in", () => {
    const r = evaluateQualifiable({ ...complete, lead_gen_only: true }, HIDEBRANDT);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/lead generation only/);
    expect(suggestOutcome({ ...complete, lead_gen_only: true }, HIDEBRANDT)).toBe("not_qualified");
  });

  it("rejects when no selected service is offered by THIS client (services are not shared)", () => {
    const wantsEcommerce = { ...complete, needs_ecommerce: "yes" as const, services_of_interest: ["ecommerce"] };
    expect(evaluateQualifiable(wantsEcommerce, HIDEBRANDT).ok).toBe(true);
    expect(evaluateQualifiable(wantsEcommerce, TEKNOKRAFT).ok).toBe(false);
  });

  it("accepts an Admin-confirmed custom service only when that client approved it", () => {
    const key = customServiceKey("Logo design")!;
    const picked = { ...complete, services_of_interest: [key] };
    expect(evaluateQualifiable(picked, TEKNOKRAFT).ok).toBe(false);
    expect(evaluateQualifiable(picked, [...TEKNOKRAFT, key]).ok).toBe(true);
  });
});

describe("filtering categories (preliminary until the agent submits)", () => {
  it("has the seven requested categories with the requested wording", () => {
    expect(QUALIFICATION_CATEGORIES.map((c) => QUALIFICATION_CATEGORY_LABELS[c])).toEqual([
      "No Website — Potential New Website",
      "Existing Website — Redesign Opportunity",
      "SEO / Online Visibility Opportunity",
      "E-commerce Opportunity",
      "Multiple Website Services",
      "Requires Further Qualification",
      "Not Qualified — Seeking Lead Generation Only",
    ]);
  });

  it("classifies a lead from its website field alone, never claiming certainty", () => {
    expect(preliminaryCategoryFromLead(null)).toBe("requires_further_qualification"); // a blank export value is not proof of no website
    expect(preliminaryCategoryFromLead("https://acme.ca")).toBe("existing_website_redesign");
    expect(preliminaryCategoryFromLead("https://facebook.com/acme")).toBe("requires_further_qualification");
  });

  it("classifies from the agent's answers using only services the client offers", () => {
    const base = { ...complete, interested_in_seo: "no" as const, needs_ecommerce: "no" as const };
    expect(classifyFromAnswers({ ...base, has_website: "no", interested_in_new_or_redesign: "new_website" }, TEKNOKRAFT)).toBe("no_website_new");
    expect(classifyFromAnswers({ ...base, interested_in_new_or_redesign: "redesign" }, TEKNOKRAFT)).toBe("existing_website_redesign");
    expect(classifyFromAnswers({ ...base, interested_in_new_or_redesign: "neither", interested_in_seo: "yes" }, TEKNOKRAFT)).toBe("seo_visibility");
    expect(classifyFromAnswers({ ...base, interested_in_new_or_redesign: "neither", needs_ecommerce: "yes" }, HIDEBRANDT)).toBe("ecommerce");
    expect(classifyFromAnswers(complete, HIDEBRANDT)).toBe("multiple_services"); // redesign + SEO
    expect(classifyFromAnswers({ ...base, interested_in_new_or_redesign: "neither", needs_ecommerce: "yes" }, TEKNOKRAFT)).toBe("requires_further_qualification"); // e-commerce not offered
    expect(classifyFromAnswers({ ...complete, lead_gen_only: true }, HIDEBRANDT)).toBe("not_qualified_lead_gen_only");
    expect(classifyFromAnswers(EMPTY_ANSWERS, HIDEBRANDT)).toBe("requires_further_qualification");
  });

  it("does not call a redesign a redesign when the prospect said they have no website", () => {
    expect(classifyFromAnswers({ ...complete, has_website: "no", interested_in_new_or_redesign: "redesign", interested_in_seo: "no" }, HIDEBRANDT)).toBe("requires_further_qualification");
  });
});

describe("input normalisation", () => {
  it("drops invalid enum values and unknown services, trims text", () => {
    const n = normalizeAnswers({ has_website: "maybe", interested_in_seo: "yes", challenges: "  slow site  ", services_of_interest: ["new_website", "cold_calling", "custom:Logo design", "custom:"], understands_services: "true" });
    expect(n.has_website).toBeNull();
    expect(n.interested_in_seo).toBe("yes");
    expect(n.challenges).toBe("slow site");
    expect(n.services_of_interest).toEqual(["new_website", "custom:Logo design"]);
    expect(n.understands_services).toBe(true);
    expect(n.agreed_to_appointment).toBeNull();
  });
});

describe("client notifications are held until approval", () => {
  it.each([
    [undefined, true],
    [null, true],
    ["not_required", true],
    ["approved", true],
    ["pending_review", false],
    ["needs_info", false],
    ["rejected", false],
  ])("isClientNotifiable(%s) = %s", (status, expected) => {
    expect(isClientNotifiable(status as string | null | undefined)).toBe(expected);
  });
});

describe("rejection reasons", () => {
  it("round-trips a reason into a countable bucket", () => {
    expect(composeRejectionReason("Prospect wants lead generation only", "Asked about cold calling twice")).toBe("Prospect wants lead generation only — Asked about cold calling twice");
    expect(rejectionReasonBucket("Prospect wants lead generation only — Asked about cold calling twice")).toBe("Prospect wants lead generation only");
    expect(rejectionReasonBucket("something free-typed")).toBe("Other");
    expect(rejectionReasonBucket(null)).toBe("No reason recorded");
    expect(composeRejectionReason("not an option", "x")).toBe("Other — x");
  });
});

describe("appointment brief never presents unconfirmed requirements as verified", () => {
  const ctx = { prospectName: "Jordan", businessName: "JC Decorating", appointmentDate: "2026-11-10", appointmentTime: "14:30:00", timezone: "America/Winnipeg", agentName: "Goodness Ugbana", leadWebsite: null };

  it("includes every required brief item for a verified qualification", () => {
    const text = buildQualificationBriefLines({ ...ctx, answers: complete, verified: true }).join("\n");
    for (const needle of ["Jordan", "JC Decorating", "https://example.ca", "Website redesign and rebranding", "Old site, not mobile friendly", "Better search visibility", "Qualification notes", "2026-11-10 14:30", "Goodness Ugbana"]) {
      expect(text).toContain(needle);
    }
    expect(text).toContain("confirmed with the prospect");
  });

  it("labels an unverified qualification as unconfirmed and shows 'not stated' for missing answers", () => {
    const lines = buildQualificationBriefLines({ ...ctx, answers: { ...EMPTY_ANSWERS, has_website: "unsure", services_of_interest: [] }, verified: false });
    const text = lines.join("\n");
    expect(lines[0]).toMatch(/NOT yet verified/);
    expect(text).toContain("Website: Not confirmed");
    expect(text).toContain("Requested services: None confirmed");
    expect(text).toContain("Confirmed challenges: Not stated by the prospect");
    expect(text).toContain("Intended improvements: Not stated by the prospect");
  });

  it("states a no-website prospect plainly", () => {
    expect(buildQualificationBriefLines({ ...ctx, answers: { ...complete, has_website: "no", website_url: null }, verified: true }).join("\n")).toContain("No website (confirmed by the prospect)");
  });
});

describe("reporting", () => {
  const clients = [
    { id: "hid", name: "Hidebrandt Web Services" },
    { id: "tek", name: "Teknokraft Canada Inc." },
  ];
  const agents = [
    { id: "g", name: "Goodness Ugbana" },
    { id: "h", name: "Henry Osuji" },
  ];
  const metrics = buildQcMetrics({
    clients,
    agents,
    calls: [
      { client_id: "hid", agent_id: "g", contact_key: "a" },
      { client_id: "hid", agent_id: "g", contact_key: "a" }, // same contact called twice counts once
      { client_id: "hid", agent_id: "g", contact_key: "b" },
      { client_id: "tek", agent_id: "h", contact_key: "c" },
    ],
    qualifications: [
      { client_id: "hid", agent_id: "g", outcome: "qualified" },
      { client_id: "hid", agent_id: "g", outcome: "not_qualified" },
      { client_id: "tek", agent_id: "h", outcome: "qualified" },
    ],
    appointments: [
      { id: "1", client_id: "hid", agent_id: "g", qc_status: "approved", status: "Completed", qc_rejection_reason: null },
      { id: "2", client_id: "hid", agent_id: "g", qc_status: "rejected", status: "Booked", qc_rejection_reason: "Prospect wants lead generation only — x" },
      { id: "3", client_id: "hid", agent_id: "g", qc_status: "pending_review", status: "Booked", qc_rejection_reason: null },
      { id: "4", client_id: "tek", agent_id: "h", qc_status: "approved", status: "Booked", qc_rejection_reason: null },
      { id: "5", client_id: "tek", agent_id: "h", qc_status: "not_required", status: "Booked", qc_rejection_reason: null }, // legacy: never reviewed, not counted
    ],
    conversions: [
      { appointment_id: "1", conversion_status: "converted_paid" },
      { appointment_id: "4", conversion_status: "proposal_sent" },
    ],
  });

  it("keeps Hidebrandt and Teknokraft separate, with per-agent rows", () => {
    expect(metrics.map((m) => m.clientName)).toEqual(["Hidebrandt Web Services", "Teknokraft Canada Inc."]);
    const hid = metrics[0];
    expect(hid.totals).toMatchObject({ contacted: 2, qualified: 1, submitted: 3, approved: 1, rejected: 1, pending: 1, completed: 1, converted: 1 });
    expect(hid.totals.rejectionReasons).toEqual({ "Prospect wants lead generation only": 1 });
    expect(hid.agents.map((a) => a.agentName)).toEqual(["Goodness Ugbana"]);
    const tek = metrics[1];
    expect(tek.totals).toMatchObject({ contacted: 1, qualified: 1, submitted: 1, approved: 1, rejected: 0, completed: 0, converted: 0 });
    expect(tek.agents.map((a) => a.agentName)).toEqual(["Henry Osuji"]);
  });

  it("computes the acceptance rate over decided appointments only", () => {
    expect(acceptanceRate(metrics[0].totals)).toBe(50);
    expect(acceptanceRate({ approved: 0, rejected: 0 })).toBeNull();
  });
});


describe("Google visibility / marketing answers", () => {
  it("normalizes the new fields and rejects unknown values", () => {
    const a = normalizeAnswers({ google_interest: "more", online_customers_satisfied: "satisfied", google_visibility: "unsure", ai_search_interest: "more", investing_marketing: "no", specialist_interest: "follow_up" });
    expect(a).toMatchObject({ google_interest: "more", online_customers_satisfied: "satisfied", google_visibility: "unsure", ai_search_interest: "more", investing_marketing: "no", specialist_interest: "follow_up" });
    const bad = normalizeAnswers({ google_interest: "maybe", specialist_interest: "sure", ai_search_interest: "unsure" });
    expect(bad.google_interest).toBeNull();
    expect(bad.specialist_interest).toBeNull();
    expect(bad.ai_search_interest).toBeNull();
  });

  it("does not change what is required for a qualified appointment", () => {
    expect(missingAnswers({ ...EMPTY_ANSWERS })).toHaveLength(8);
    expect(isValidServiceKey("digital_marketing")).toBe(true);
  });

  it("adds marketing interests to the appointment preparation brief only when recorded", () => {
    const ctx = { verified: true, prospectName: "Pat", businessName: "Pat Plumbing", appointmentDate: "2026-11-20", appointmentTime: "10:00:00", timezone: "America/Toronto", agentName: "Henry", leadWebsite: null };
    const plain = buildQualificationBriefLines({ ...ctx, answers: { ...EMPTY_ANSWERS } }).join("\n");
    expect(plain).not.toContain("Google visibility and marketing");
    const text = buildQualificationBriefLines({
      ...ctx,
      answers: { ...EMPTY_ANSWERS, services_of_interest: ["seo_visibility", "human_search_optimization", "digital_marketing", "new_website"], google_interest: "yes", google_visibility: "no", ai_search_interest: "yes", investing_marketing: "unsure", specialist_interest: "yes" },
    }).join("\n");
    expect(text).toContain("Google visibility and marketing interests (as stated by the prospect)");
    expect(text).toContain("Marketing services of interest: SEO and online visibility, Human search optimization, Digital marketing");
    expect(text).toContain("Google ranking interest: Interested in ranking higher on Google");
    expect(text).toContain("Customers currently finding the business through Google: No");
    expect(text).toContain("AI-powered search: Yes");
    expect(text).toContain("Currently investing in SEO or digital marketing: Not sure");
    expect(text).toContain("Wants to speak with a specialist: Yes");
    expect(text).not.toMatch(/guarantee/i);
  });
});
