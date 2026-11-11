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
      "We help businesses improve their online presence through website design, Google search optimization, and Human Search Optimization, helping more potential customers discover their services online.",
    ]);
    expect(g.websitePrompt).toBe("May I ask, does your business currently have a website?");
    expect(g.hasWebsite.say).toBe("Are you satisfied with how your website looks and performs, or have you considered upgrading it to better showcase your services and attract customers?");
    expect(g.noWebsite.say).toBe("Would you be interested in exploring a professional website that helps customers find your business online and understand your services?");
    expect(g.ifInterested).toBe("Would you be open to a short consultation with a Hidebrandt website specialist to discuss your specific requirements?");
  });

  it("Teknokraft uses the exact approved script", () => {
    const g = getCallGuide("Teknokraft Canada Inc.")!;
    expect(g.opening.map((l) => renderGuideLine(l, "Goodness Ugbana"))).toEqual([
      "Hi, my name is Goodness, calling from Winsalot Corp. on behalf of Teknokraft Canada Inc.",
      "We help businesses establish and improve their online presence through website development, website redesign, and search engine optimization.",
      "We help businesses improve their visibility on Google, market their services online, and attract more potential customers.",
    ]);
    expect(g.websitePrompt).toBe("May I ask, does your business currently have a website?");
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

  it("shows only the opening and the Google question before an answer, with a Copy Script button", () => {
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Hidebrandt Web Services")));
    expect(html).toContain("Hi, my name is Henry, calling from Winsalot Corp. on behalf of Hidebrandt Web Services.");
    expect(html).toContain("Copy Script");
    expect(html).toContain("Would you like your business to rank higher on Google");
    expect(html).not.toContain("Does the prospect have a website?");
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


// ---------------------------------------------------------------------------
// Google ranking / marketing step
// ---------------------------------------------------------------------------
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
const render = (clientName: string, value: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(InteractiveCallGuide, {
      guide: getCallGuide(clientName)!,
      agentName: "Henry Osuji",
      approvedServices: ["new_website", "redesign_rebranding", "seo_visibility", "human_search_optimization", "digital_marketing"],
      value: { ...EMPTY_ANSWERS, ...value },
      onChange: () => undefined,
      ...extra,
    })
  );

describe("Google step: the exact statement appears right after each answer", () => {
  for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
    const g = getCallGuide(name)!.google;
    it(`${name}: yes / more / no each show only their own approved response`, () => {
      for (const choice of ["yes", "more", "no"] as const) {
        const html = render(name, { google_interest: choice });
        for (const line of g.say[choice]) expect(html).toContain(esc(line));
        for (const other of (["yes", "more", "no"] as const).filter((c) => c !== choice)) for (const line of g.say[other]) expect(html).not.toContain(esc(line));
      }
    });
    it(`${name}: shows no Google response until an answer is chosen`, () => {
      const html = render(name, {});
      expect(html).toContain(esc(g.question));
      expect(html).not.toContain('data-testid="google-response"');
    });
    it(`${name}: option labels are the approved ones`, () => {
      const html = render(name, {});
      for (const o of g.options) expect(html).toContain(`>${esc(o.label)}</button>`);
    });
  }

  it("the Google question is the same approved wording, ahead of the website question, in the guide and the script", () => {
    const Q = "Would you like your business to rank higher on Google and market your services online so more customers can find you?";
    for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
      const g = getCallGuide(name)!;
      expect(g.google.question).toBe(Q);
      expect(g.google.options.map((o) => o.label)).toEqual(["Yes, I’m interested", "Tell me more", "No, not interested"]);
      const html = render(name, { google_interest: "yes", has_website: "yes" });
      const order = [esc(Q), "Read this next", esc(g.websitePrompt), "Additional SEO and marketing qualification", "Which services", "Appointment booking or follow-up"].map((t) => html.indexOf(t));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      const text = callGuideToText(g, "Henry");
      const t = [Q, g.google.say.yes[0], g.websitePrompt, "5. ADDITIONAL SEO AND MARKETING", "6. APPOINTMENT BOOKING"].map((x) => text.indexOf(x));
      expect(t.every((i) => i >= 0)).toBe(true);
      expect([...t].sort((a, b) => a - b)).toEqual(t);
      expect(text.indexOf("1. AGENT INTRODUCTION")).toBeLessThan(text.indexOf(Q));
      const script = buildLeadgenCallScript({ agentName: "Goodness Ugbana", client: { name, ...base } }).fullText;
      expect(script.indexOf(Q)).toBeLessThan(script.indexOf(g.websitePrompt));
    }
    expect(getCallGuide("Teknokraft Canada Inc.")!.google.say.yes.join(" ")).toMatch(/local search visibility/);
    expect(getCallGuide("Hidebrandt Web Services")!.google.say.yes.join(" ")).toMatch(/Human Search Optimization/);
  });

  it("Hidebrandt follow-up questions and options (incl. 'Tell me more' on the AI-search question)", () => {
    const html = render("Hidebrandt Web Services", { google_interest: "yes", has_website: "yes" });
    expect(html).toContain("1. Are customers currently finding your business through Google?");
    expect(html).toContain("2. Would you like your business to become easier to discover through Google and AI-powered search tools?");
    expect(html).toContain("3. Are you currently investing in SEO or digital marketing?");
    expect(html).toContain("Which services interest you? (select all that apply)");
    expect(html).toContain("Digital marketing");
    expect(html).toContain("Human search optimization");
  });

  it("Teknokraft follow-up questions use the approved numbering", () => {
    const html = render("Teknokraft Canada Inc.", { google_interest: "yes", has_website: "no" });
    expect(html).toContain("2. Does your business currently appear on Google when customers search for your services?");
    expect(html).toContain("3. Are you currently investing in SEO or digital marketing?");
    expect(html).not.toContain("AI-powered search tools");
  });

  it("the website question and qualification follow the Google answer, and stay for older leads", () => {
    expect(render("Teknokraft Canada Inc.", {})).not.toContain("May I ask, does your business currently have a website?");
    expect(render("Teknokraft Canada Inc.", { google_interest: "yes" })).toContain("May I ask, does your business currently have a website?");
    // A lead qualified before this step existed keeps its website flow.
    expect(render("Hidebrandt Web Services", { has_website: "yes" })).toContain("Prospect has a website");
  });

  it("NO + satisfied ends the call politely and hides the rest of the flow", () => {
    for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
      const html = render(name, { google_interest: "no", online_customers_satisfied: "satisfied" });
      expect(html).toContain("Do not offer a");
      expect(html).not.toContain("Does the prospect have a website?");
      const keepGoing = render(name, { google_interest: "no", online_customers_satisfied: "not_satisfied" });
      expect(keepGoing).toContain("Does the prospect have a website?");
    }
  });

  it("booking script appears once the prospect wants a specialist (or agreed), not before", () => {
    for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
      const booking = getCallGuide(name)!.google.booking;
      expect(render(name, { google_interest: "yes", has_website: "yes" })).not.toContain(esc(booking));
      expect(render(name, { google_interest: "yes", has_website: "yes", specialist_interest: "yes" })).toContain(esc(booking));
      expect(render(name, { google_interest: "more", specialist_interest: "yes" })).toContain(esc(booking));
      expect(render(name, { google_interest: "yes", has_website: "no", specialist_interest: "no" })).not.toContain(esc(booking));
    }
    expect(getCallGuide("Hidebrandt Web Services")!.google.booking).toContain("morning or afternoon appointment");
    expect(getCallGuide("Teknokraft Canada Inc.")!.google.booking).toContain("What day and time would be convenient for you?");
  });

  it("Copy Script contains the whole Google flow for each client", () => {
    for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
      const g = getCallGuide(name)!;
      const text = callGuideToText(g, "Henry Osuji");
      expect(text).toContain(g.google.question);
      for (const lines of Object.values(g.google.say)) for (const l of lines) expect(text).toContain(l);
      expect(text).toContain(g.google.booking);
      for (const f of g.google.followUps) expect(text).toContain(f.label);
    }
  });

  it("never guarantees rankings, AI placement or lead volumes", () => {
    for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
      const text = callGuideToText(getCallGuide(name)!, "Henry");
      expect(text).not.toMatch(/guarantee|first[- ]page|#1|number one|top spot|\d+\s+(new )?leads|ensure.*rank/i);
    }
  });

  it("keeps the two clients' scripts separate and leaves other clients untouched", () => {
    const h = callGuideToText(getCallGuide("Hidebrandt Web Services")!, "Henry");
    const t = callGuideToText(getCallGuide("Teknokraft Canada Inc.")!, "Henry");
    expect(h).not.toMatch(/Teknokraft/);
    expect(t).not.toMatch(/Hidebrandt|Human Search Optimization|AI-powered/);
    expect(getCallGuide("Web6 Solutions")).toBeNull();
    expect(buildLeadgenCallScript({ agentName: "Henry", client: { name: "Web6 Solutions", ...base } }).guide).toBeUndefined();
  });

  it("is the same guide for every agent (Henry and Goodness)", () => {
    const a = buildLeadgenCallScript({ agentName: "Henry Osuji", client: TEK }).fullText;
    const b = buildLeadgenCallScript({ agentName: "Goodness Ugbana", client: TEK }).fullText;
    expect(a.replace(/Henry/g, "X")).toBe(b.replace(/Goodness/g, "X"));
  });
});
