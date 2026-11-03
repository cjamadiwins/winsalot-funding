import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NOT_QUALIFIED_LEAD_GEN_LABEL, callGuideToText, clientOffersEcommerce, getCallGuide, renderGuideLine } from "../leadgen-call-guide";
import { buildLeadgenCallScript } from "../leadgen-call-script";
import { acceptanceRate, buildQcMetrics, evaluateQualifiable, suggestOutcome, EMPTY_ANSWERS } from "../leadgen-qualification";
import InteractiveCallGuide from "@/components/leadgen/InteractiveCallGuide";
import ClientCallScriptPanel from "@/components/leadgen/ClientCallScriptPanel";

const base = { call_script_value_proposition: null, call_script_services: null, call_script_closing: null, call_script_notes: null, call_script_override: null };
const HID = { name: "Hidebrandt Web Services", ...base };
const TEK = { name: "Teknokraft Canada Inc.", ...base };

describe("approved call guide wording", () => {
  it("Hidebrandt uses the exact approved script", () => {
    const g = getCallGuide("Hidebrandt Web Services")!;
    expect(g.opening.map((l) => renderGuideLine(l, "Henry Osuji"))).toEqual([
      "Hi, my name is Henry, calling from Winsalot Corp. on behalf of Hidebrandt Web Services.",
      "We help businesses improve their online presence through professional website development, website redesign, and search visibility solutions.",
      "May I ask, does your business currently have a website?",
    ]);
    expect(g.hasWebsite.say).toBe("Are you satisfied with how your website looks and performs, or have you considered upgrading it to better showcase your services and attract customers?");
    expect(g.noWebsite.say).toBe("Would you be interested in exploring a professional website that helps customers find your business online and understand your services?");
    expect(g.ifInterested).toBe("Would you be open to a short consultation with a Hidebrandt website specialist to discuss your specific requirements?");
  });

  it("Teknokraft uses the exact approved script", () => {
    const g = getCallGuide("Teknokraft Canada Inc.")!;
    expect(g.opening.map((l) => renderGuideLine(l, "Goodness Ugbana"))).toEqual([
      "Hi, my name is Goodness, calling from Winsalot Corp. on behalf of Teknokraft Canada Inc.",
      "We help businesses establish and improve their online presence through website development, website redesign, and search engine optimization.",
      "May I ask, does your business currently have a website?",
    ]);
    expect(g.hasWebsite.say).toBe("Are you happy with your website’s current design and performance, or would you be interested in improving it to attract more customers online?");
    expect(g.noWebsite.say).toBe("Have you considered creating a professional website so potential customers can find your business and learn more about your services?");
    expect(g.ifInterested).toBe("We can arrange a short consultation with a Teknokraft representative to discuss your website needs and possible solutions. Would that interest you?");
  });

  it("has seven qualification questions and the lead-generation-only handling for both", () => {
    for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
      const g = getCallGuide(name)!;
      expect(g.qualificationQuestions).toHaveLength(7);
      expect(g.leadGenOnlyPrompt).toBe("Are you also considering improvements to your website or online visibility to help customers find and contact your business?");
      expect(g.leadGenOnlyOutcome).toContain(NOT_QUALIFIED_LEAD_GEN_LABEL);
      expect(g.leadGenOnlyOutcome).toContain("do not offer a client appointment");
    }
  });

  it("the old lead-generation wording is gone for both clients", () => {
    for (const client of [HID, TEK]) {
      const text = buildLeadgenCallScript({ agentName: "Henry Osuji", client }).fullText;
      expect(text).not.toMatch(/generate more leads|rebrand their websites|came across your website|looking to improve your website or get more leads/i);
    }
  });

  it("other clients get no guide and keep their existing script", () => {
    expect(getCallGuide("Web6 Solutions")).toBeNull();
    expect(getCallGuide("Brent's Essentials")).toBeNull();
    const web6 = buildLeadgenCallScript({ agentName: "Henry Osuji", client: { name: "Web6 Solutions", ...base } });
    expect(web6.guide).toBeUndefined();
    expect(web6.fullText).toContain("generate more leads and rebrand their websites");
    const other = buildLeadgenCallScript({ agentName: "Henry Osuji", client: { name: "Brent's Essentials", ...base, call_script_services: "essential oils" }, websiteServices: false });
    expect(other.guide).toBeUndefined();
    expect(other.opening?.[1]).toContain("Brent's Essentials");
  });
});

describe("clients are kept separate", () => {
  it("each client's script names only that client", () => {
    const h = buildLeadgenCallScript({ agentName: "Henry Osuji", client: HID }).fullText;
    const t = buildLeadgenCallScript({ agentName: "Henry Osuji", client: TEK }).fullText;
    expect(h).toContain("Hidebrandt");
    expect(h).not.toContain("Teknokraft");
    expect(t).toContain("Teknokraft");
    expect(t).not.toContain("Hidebrandt");
  });

  it("e-commerce is asked only when the client offers it", () => {
    expect(clientOffersEcommerce(["new_website", "ecommerce"])).toBe(true);
    expect(clientOffersEcommerce(["new_website", "seo_visibility"])).toBe(false);
    const hid = callGuideToText(getCallGuide("Hidebrandt Web Services")!, "Henry", { offersEcommerce: true });
    const tek = callGuideToText(getCallGuide("Teknokraft Canada Inc.")!, "Henry", { offersEcommerce: false });
    expect(hid).toMatch(/e-commerce/i);
    expect(tek).not.toMatch(/e-commerce/i);
    // Defaults mirror the launch settings: Hidebrandt offers it, Teknokraft does not.
    expect(buildLeadgenCallScript({ agentName: "Henry", client: HID }).fullText).toMatch(/e-commerce/i);
    expect(buildLeadgenCallScript({ agentName: "Henry", client: TEK }).fullText).not.toMatch(/e-commerce/i);
    // Once Admin confirms Teknokraft e-commerce the question appears.
    expect(buildLeadgenCallScript({ agentName: "Henry", client: TEK, approvedServices: ["new_website", "ecommerce"] }).fullText).toMatch(/e-commerce/i);
  });
});

describe("displayed and copied script match", () => {
  it("fullText (Copy Script) contains every displayed spoken line", () => {
    for (const client of [HID, TEK]) {
      const script = buildLeadgenCallScript({ agentName: "Goodness Ugbana", client });
      const g = script.guide!;
      const html = renderToStaticMarkup(createElement(ClientCallScriptPanel, { script }));
      for (const line of g.opening.map((l) => renderGuideLine(l, "Goodness Ugbana"))) {
        expect(script.fullText).toContain(line);
        expect(html).toContain(line.replace(/'/g, "&#x27;"));
      }
      expect(script.fullText).toContain(g.hasWebsite.say);
      expect(script.fullText).toContain(g.noWebsite.say);
      expect(script.fullText).toContain(g.ifInterested);
      expect(script.fullText).toContain(g.leadGenOnlyPrompt);
    }
  });

  it("uses the dynamic agent name, with a placeholder when there is none", () => {
    expect(buildLeadgenCallScript({ agentName: "Henry Osuji", client: HID }).fullText).toContain("my name is Henry,");
    expect(buildLeadgenCallScript({ agentName: "", client: HID }).fullText).toContain("my name is [Agent Name],");
  });
});

describe("interactive guide rendering", () => {
  const props = (clientName: string, extra: Record<string, unknown> = {}) => ({ guide: getCallGuide(clientName)!, agentName: "Henry Osuji", approvedServices: ["new_website", "redesign_rebranding", "seo_visibility"], ...extra });

  it("shows only the opening and the website question before an answer, with a Copy Script button", () => {
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Hidebrandt Web Services")));
    expect(html).toContain("Hi, my name is Henry, calling from Winsalot Corp. on behalf of Hidebrandt Web Services.");
    expect(html).toContain("Copy Script");
    expect(html).toContain("Does the prospect have a website?");
    expect(html).not.toContain("Prospect has a website");
    expect(html).not.toContain("Prospect has no website");
    expect(html).toContain("Preview only");
  });

  it("YES branch asks about redesign, performance, SEO and (where offered) e-commerce", () => {
    const value = { ...EMPTY_ANSWERS, has_website: "yes" as const };
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Hidebrandt Web Services", { value, onChange: () => undefined, approvedServices: ["new_website", "ecommerce"] })));
    expect(html).toContain("Prospect has a website");
    expect(html).toContain("Are you satisfied with how your website looks and performs");
    expect(html).toContain("Interested in a redesign or upgrade?");
    expect(html).toContain("Satisfied with design and performance?");
    expect(html).toContain("Interested in SEO or better search visibility?");
    expect(html).toContain("Needs e-commerce functionality?");
    expect(html).toContain("Website address");
    expect(html).not.toContain("Preview only");
  });

  it("YES branch for Teknokraft hides e-commerce until Admin approves it", () => {
    const value = { ...EMPTY_ANSWERS, has_website: "yes" as const };
    const without = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Teknokraft Canada Inc.", { value, onChange: () => undefined })));
    expect(without).not.toContain("Needs e-commerce functionality?");
    expect(without).toContain("do not pitch it");
    const withIt = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Teknokraft Canada Inc.", { value, onChange: () => undefined, approvedServices: ["new_website", "ecommerce"] })));
    expect(withIt).toContain("Needs e-commerce functionality?");
  });

  it("NO branch asks about a new website and online presence, not satisfaction", () => {
    const value = { ...EMPTY_ANSWERS, has_website: "no" as const };
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Teknokraft Canada Inc.", { value, onChange: () => undefined })));
    expect(html).toContain("Prospect has no website");
    expect(html).toContain("Have you considered creating a professional website");
    expect(html).toContain("Interested in a new website?");
    expect(html).toContain("Interested in establishing an online presence / search visibility?");
    expect(html).not.toContain("Satisfied with design and performance?");
    expect(html).not.toContain("Website address");
  });

  it("offers only the services this client has approved, and records requirements and call notes", () => {
    const value = { ...EMPTY_ANSWERS, has_website: "no" as const };
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Teknokraft Canada Inc.", { value, onChange: () => undefined })));
    expect(html).toContain("New website");
    expect(html).toContain("SEO");
    expect(html).not.toContain("E-commerce");
    expect(html).toContain("Prospect requirements");
    expect(html).toContain("Call notes");
    expect(html).toContain("Specific website-related need");
  });

  it("lead-generation-only: shows the follow-up question, the unqualified outcome and no appointment offer", () => {
    const value = { ...EMPTY_ANSWERS, has_website: "no" as const, lead_gen_only: true };
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Hidebrandt Web Services", { value, onChange: () => undefined, onMarkNotQualified: () => undefined })));
    expect(html).toContain("Are you also considering improvements to your website or online visibility");
    expect(html).toContain(NOT_QUALIFIED_LEAD_GEN_LABEL);
    expect(html).toContain("Do not offer a Hidebrandt appointment");
    expect(html).toContain(`Save as ${NOT_QUALIFIED_LEAD_GEN_LABEL}`);
  });

  it("states that Admin approval comes before anything reaches the client", () => {
    const value = { ...EMPTY_ANSWERS, has_website: "yes" as const };
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Hidebrandt Web Services", { value, onChange: () => undefined })));
    expect(html).toContain("goes to Admin for approval before anything is sent to Hidebrandt");
  });
});

describe("qualification rules still gate the guide's answers", () => {
  const approved = ["new_website", "redesign_rebranding", "seo_visibility"];
  const full = { ...EMPTY_ANSWERS, has_website: "no" as const, interested_in_new_or_redesign: "new_website" as const, satisfied_with_site: "not_applicable" as const, needs_ecommerce: "no" as const, interested_in_seo: "yes" as const, challenges: "No site", understands_services: true, agreed_to_appointment: true, services_of_interest: ["new_website"] };

  it("lead-generation-only can never be qualified and suggests not qualified", () => {
    const answers = { ...full, lead_gen_only: true };
    expect(evaluateQualifiable(answers, approved).ok).toBe(false);
    expect(suggestOutcome(answers, approved)).toBe("not_qualified");
  });

  it("a complete answer set with an approved service is qualifiable; one without an approved service is not", () => {
    expect(evaluateQualifiable(full, approved).ok).toBe(true);
    expect(evaluateQualifiable({ ...full, services_of_interest: ["ecommerce"] }, approved).ok).toBe(false);
    expect(evaluateQualifiable({ ...full, agreed_to_appointment: false }, approved).ok).toBe(false);
  });
});

describe("Admin monitoring counts lead-generation-only prospects per client and agent", () => {
  it("counts them separately from qualified, per client", () => {
    const groups = buildQcMetrics({
      clients: [{ id: "h", name: "Hidebrandt Web Services" }, { id: "t", name: "Teknokraft Canada Inc." }],
      agents: [{ id: "henry", name: "Henry Osuji" }, { id: "good", name: "Goodness Ugbana" }],
      calls: [],
      qualifications: [
        { client_id: "h", agent_id: "henry", outcome: "qualified" },
        { client_id: "h", agent_id: "henry", outcome: "not_qualified", lead_gen_only: true },
        { client_id: "h", agent_id: "good", outcome: "not_qualified", lead_gen_only: true },
        { client_id: "t", agent_id: "good", outcome: "not_qualified", lead_gen_only: false },
        { client_id: "t", agent_id: "good", outcome: "not_qualified", lead_gen_only: true },
      ],
      appointments: [],
      conversions: [],
    });
    const h = groups.find((g) => g.clientId === "h")!;
    const t = groups.find((g) => g.clientId === "t")!;
    expect(h.totals).toMatchObject({ qualified: 1, leadGenOnly: 2 });
    expect(h.agents.find((a) => a.agentId === "henry")!.metrics).toMatchObject({ qualified: 1, leadGenOnly: 1 });
    expect(t.totals).toMatchObject({ qualified: 0, leadGenOnly: 1 });
    expect(acceptanceRate(h.totals)).toBeNull();
  });
});
