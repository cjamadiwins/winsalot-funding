import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GUIDE_PREVIEW_SERVICES, NOT_QUALIFIED_LEAD_GEN_LABEL, callGuideToText, clientOffersEcommerce, getCallGuide, renderGuideLine } from "../leadgen-call-guide";
import { buildLeadgenCallScript } from "../leadgen-call-script";
import { acceptanceRate, buildQcMetrics, evaluateQualifiable, isLegacyQualification, suggestOutcome, EMPTY_ANSWERS } from "../leadgen-qualification";
import InteractiveCallGuide from "@/components/leadgen/InteractiveCallGuide";
import ClientCallScriptPanel from "@/components/leadgen/ClientCallScriptPanel";

const base = { call_script_value_proposition: null, call_script_services: null, call_script_closing: null, call_script_notes: null, call_script_override: null };
const HID = { name: "Hidebrandt Web Services", ...base };
const TEK = { name: "Teknokraft Canada Inc.", ...base };

describe("approved call guide wording", () => {
  it("Hidebrandt: one concise introduction, no repeated description, then the Google question", () => {
    const g = getCallGuide("Hidebrandt Web Services")!;
    expect(g.opening.map((l) => renderGuideLine(l, "Henry Osuji"))).toEqual([
      "Hi, my name is Henry, calling from Winsalot Corp. on behalf of Hidebrandt Web Services. We help businesses improve their Google visibility and attract more customers through website improvements and search optimization.",
    ]);
    expect(g.websitePrompt).toBe("May I ask, does your business currently have a website?");
    expect(g.hasWebsite.say).toBe("Are you satisfied with how your website looks and performs, or have you considered upgrading it to better showcase your services and attract customers?");
    expect(g.noWebsite.say).toBe("Would you be interested in exploring a professional website that helps customers find your business online and understand your services?");
    expect(g.ifInterested).toBe("Would you be open to a short consultation with a Hidebrandt website specialist to discuss your specific requirements?");
    // The only description of the company is inside the introduction itself.
    const text = callGuideToText(g, "Henry");
    expect(text.match(/We help businesses/g)).toHaveLength(1);
    expect(text).toMatch(/1\. PROFESSIONAL INTRODUCTION\nHi, my name is Henry, [^\n]+\n\n2\. GOOGLE VISIBILITY QUESTION[^\n]*\nWould you like your business to appear higher on Google/);
  });

  it("Teknokraft: same concise introduction structure, then the Google question", () => {
    const g = getCallGuide("Teknokraft Canada Inc.")!;
    expect(g.opening.map((l) => renderGuideLine(l, "Goodness Ugbana"))).toEqual([
      "Hi, my name is Goodness, calling from Winsalot Corp. on behalf of Teknokraft Canada Inc. We help businesses attract more potential customers through website design and redesign, Google search visibility, SEO, and digital marketing.",
    ]);
    expect(g.websitePrompt).toBe("May I ask, does your business currently have a website?");
    expect(g.hasWebsite.say).toBe("Are you happy with your website’s current design and performance, or would you be interested in improving it to attract more customers online?");
    expect(g.noWebsite.say).toBe("Have you considered creating a professional website so potential customers can find your business and learn more about your services?");
    expect(g.ifInterested).toBe("We can arrange a short consultation with a Teknokraft representative to discuss your website needs and possible solutions. Would that interest you?");
    const text = callGuideToText(g, "Goodness");
    expect(text.match(/We help businesses/g)).toHaveLength(1);
    expect(text).toMatch(/1\. PROFESSIONAL INTRODUCTION\nHi, my name is Goodness, [^\n]+\n\n2\. GOOGLE VISIBILITY QUESTION[^\n]*\nWould you like your business to appear higher on Google/);
    for (const topic of [/website design and redesign/, /Google search visibility/, /SEO/, /digital marketing/, /attract more potential customers/]) expect(g.opening[0]).toMatch(topic);
  });

  it("Hidebrandt keeps Human Search Optimization in the service explanation and qualification, not repeated in the introduction", () => {
    const g = getCallGuide("Hidebrandt Web Services")!;
    expect(g.opening.join(" ")).not.toMatch(/Human Search Optimization/);
    expect(g.google.servicePitch.say.join(" ")).toMatch(/Human Search Optimization/);
    expect(g.google.say.yes.join(" ")).toMatch(/Human Search Optimization/);
    expect(GUIDE_PREVIEW_SERVICES.hidebrandt).toContain("human_search_optimization");
    expect(callGuideToText(g, "Henry")).toMatch(/separate from traditional SEO/);
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
    expect(html).toContain("Would you like your business to appear higher on Google when customers search for your services");
    expect(html).not.toContain("Does the prospect have a website?");
    expect(html).not.toContain("Prospect has a website");
    expect(html).not.toContain("Prospect has no website");
    expect(html).toContain("Preview only");
  });

  it("YES branch asks about redesign, performance, SEO and (where offered) e-commerce", () => {
    const value = { ...EMPTY_ANSWERS, has_website: "yes" as const };
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Hidebrandt Web Services", { value, onChange: () => undefined, approvedServices: ["new_website", "ecommerce"] })));
    expect(html).toContain("Website: improvement or rebranding?");
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
    expect(html).toContain("No website: new website?");
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
    expect(html).toContain("Specific requirements");
    expect(html).toContain("Call notes");
    expect(html).toContain("Business need or growth objective");
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
    const value = { ...EMPTY_ANSWERS, google_interest: "yes" as const };
    const html = renderToStaticMarkup(createElement(InteractiveCallGuide, props("Hidebrandt Web Services", { value, onChange: () => undefined, bookingOpen: true, bookingSlot: createElement("div", null, "form") })));
    expect(html).toContain("goes to Admin for approval before anything is sent to Hidebrandt");
  });
});

describe("qualification rules still gate the guide's answers", () => {
  const approved = ["new_website", "redesign_rebranding", "seo_visibility"];
  const full = { ...EMPTY_ANSWERS, decision_maker: "yes" as const, contact_verified: true, appointment_confirmed: true, has_website: "no" as const, interested_in_new_or_redesign: "new_website" as const, satisfied_with_site: "not_applicable" as const, needs_ecommerce: "no" as const, interested_in_seo: "yes" as const, challenges: "No site", understands_services: true, agreed_to_appointment: true, services_of_interest: ["new_website"] };

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

  it("the website question and qualification follow the Google answer, and stay for older leads", () => {
    expect(render("Teknokraft Canada Inc.", {})).not.toContain("May I ask, does your business currently have a website?");
    expect(render("Teknokraft Canada Inc.", { google_interest: "yes" })).toContain("May I ask, does your business currently have a website?");
    // A lead qualified before this step existed keeps its website flow.
    expect(render("Hidebrandt Web Services", { has_website: "yes" })).toContain("Website: improvement or rebranding?");
  });

  it("NO + satisfied ends the call politely and hides the rest of the flow", () => {
    for (const name of ["Hidebrandt Web Services", "Teknokraft Canada Inc."]) {
      const html = render(name, { google_interest: "no", online_customers_satisfied: "satisfied" });
      expect(html).toContain("Do not offer a");
      expect(html).not.toContain("Record remaining requirements");
      const keepGoing = render(name, { google_interest: "no", online_customers_satisfied: "not_satisfied" });
      expect(keepGoing).toContain("Record remaining requirements");
    }
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

// ---------------------------------------------------------------------------
// Google-first, ten-step call structure, objection handling and the
// qualified-appointment rule
// ---------------------------------------------------------------------------
const CLIENTS = ["Hidebrandt Web Services", "Teknokraft Canada Inc."] as const;
const NEW_Q = "Would you like your business to appear higher on Google when customers search for your services, so more people can find you and contact you?";
const FULL = { google_interest: "yes", google_visibility: "no", has_website: "yes", services_of_interest: ["seo_visibility"], understands_services: true, specialist_interest: "yes", agreed_to_appointment: true, decision_maker: "yes" } as const;

describe("ten-step structure (Google first)", () => {
  it("the mandatory Google question is exact, in both guides and both scripts, right after the introduction", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!;
      expect(g.google.question).toBe(NEW_Q);
      expect(g.google.options.map((o) => o.label)).toEqual(["Yes, I’m interested", "Tell me more", "No, not interested"]);
      const text = callGuideToText(g, "Henry");
      expect(text.indexOf("1. PROFESSIONAL INTRODUCTION")).toBe(0);
      expect(text.indexOf(NEW_Q)).toBeLessThan(text.indexOf(g.websitePrompt));
      const script = buildLeadgenCallScript({ agentName: "Goodness Ugbana", client: { name, ...base } }).fullText;
      expect(script.indexOf(NEW_Q)).toBeLessThan(script.indexOf(g.websitePrompt));
      // The website question is never asked before the Google question.
      expect(g.opening.join(" ")).not.toContain(g.websitePrompt);
    }
  });

  it("follows the booking-first sequence in the interactive guide and in Copy Script", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!;
      const html = render(name, { google_interest: "yes" }, { bookingOpen: true, bookingSlot: createElement("div", { id: "slot" }, "BOOKING-FORM"), onBookAppointment: () => undefined });
      const marks = [
        "Professional introduction",
        esc(NEW_Q),
        "Recommended response",
        'data-testid="book-appointment"',
        "Confirm the appointment",
        "BOOKING-FORM",
        "Record remaining requirements",
        "Objection handling",
      ].map((m) => html.indexOf(m));
      expect(marks.every((i) => i >= 0)).toBe(true);
      expect([...marks].sort((a, b) => a - b)).toEqual(marks);

      const text = callGuideToText(g, "Henry");
      const heads = ["1. PROFESSIONAL INTRODUCTION", "2. GOOGLE VISIBILITY QUESTION", "IF THE PROSPECT SAYS YES", "IF THE PROSPECT SAYS TELL ME MORE", "IF THE PROSPECT IS NOT READY TO BOOK", "IF THE PROSPECT SAYS NO", "3. CONFIRM THE APPOINTMENT", "4. RECORD REMAINING REQUIREMENTS", "OBJECTION HANDLING"].map((h) => text.indexOf(h));
      expect(heads.every((i) => i >= 0)).toBe(true);
      expect([...heads].sort((a, b) => a - b)).toEqual(heads);
    }
  });

  it("each client emphasizes its own services", () => {
    const tek = callGuideToText(getCallGuide("Teknokraft Canada Inc.")!, "Henry");
    for (const t of [/website development/i, /website redesign/i, /search engine optimization/i, /digital marketing/i, /online visibility/i]) expect(tek).toMatch(t);
    const hid = callGuideToText(getCallGuide("Hidebrandt Web Services")!, "Henry");
    for (const t of [/website redesign/i, /Human Search Optimization/, /search visibility/i, /relevant customers/i]) expect(hid).toMatch(t);
  });

  it("never describes HSO and traditional SEO as the same service", () => {
    const text = callGuideToText(getCallGuide("Hidebrandt Web Services")!, "Henry");
    expect(text).toMatch(/separate from traditional SEO/);
    expect(text).not.toMatch(/HSO (is|means|=) (just )?(SEO|traditional SEO)|same as (traditional )?SEO|another (word|name) for SEO|HSO and (traditional )?SEO are (the same|identical)/i);
    expect(callGuideToText(getCallGuide("Teknokraft Canada Inc.")!, "Henry")).not.toMatch(/Human Search Optimization|HSO/);
  });
});

describe("objection handling", () => {
  const LABELS = ["We already have a website.", "We already appear on Google.", "We are not interested.", "We don’t have a budget.", "Send me information by email.", "We already have someone handling our marketing.", "How much does it cost?"];

  it("covers all seven objections for both clients, as expandable items", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!;
      expect(g.objections.map((o) => o.label)).toEqual(LABELS);
      const html = render(name, {});
      expect(html.match(/<details/g)).toHaveLength(7);
      for (const o of g.objections) for (const line of o.responses) expect(html).toContain(esc(line));
      expect(html).toContain(`id="objections-${g.clientKey}"`);
    }
  });

  it("is in Copy Script too", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!;
      const text = callGuideToText(g, "Henry");
      for (const o of g.objections) expect(text).toContain(o.label);
    }
  });

  it("cost response gives no price; email response is not an appointment and respects consent; no guarantees", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!;
      const cost = g.objections.find((o) => o.id === "cost")!;
      expect([...cost.responses, cost.note].join(" ")).not.toMatch(/\$|\d+\s*(dollars|per month)|free|discount/i);
      const email = g.objections.find((o) => o.id === "send-info")!;
      expect(email.note).toMatch(/NOT a confirmed appointment/);
      expect(email.note).toMatch(/Do Not Call/i);
      expect(email.note).toMatch(/opt|consent/i);
      for (const o of g.objections) expect([...o.responses, o.note ?? ""].join(" ")).not.toMatch(/guarantee|first[- ]page|number one|#1|top spot/i);
    }
  });

  it("keeps each client's name in its own objection responses", () => {
    expect(callGuideToText(getCallGuide("Hidebrandt Web Services")!, "Henry")).not.toMatch(/Teknokraft/);
    expect(callGuideToText(getCallGuide("Teknokraft Canada Inc.")!, "Henry")).not.toMatch(/Hidebrandt/);
  });
});

describe("qualified appointment rule", () => {
  const complete = { ...EMPTY_ANSWERS, has_website: "yes" as const, interested_in_new_or_redesign: "redesign" as const, satisfied_with_site: "not_satisfied" as const, needs_ecommerce: "no" as const, interested_in_seo: "yes" as const, challenges: "Wants more enquiries" as string | null, understands_services: true, agreed_to_appointment: true, services_of_interest: ["seo_visibility"], decision_maker: "yes" as "yes" | "no" | null, contact_verified: true as boolean | null, appointment_confirmed: true as boolean | null };
  const approved = ["new_website", "seo_visibility"];

  it("qualifies only with interest, a need, the decision-maker, verified contact and a confirmed time", () => {
    expect(evaluateQualifiable(complete, approved).ok).toBe(true);
    const cases: [Partial<typeof complete>, RegExp][] = [
      [{ services_of_interest: [] }, /at least one service/i],
      [{ challenges: null }, /Answer every required question/],
      [{ decision_maker: "no" }, /owner or the decision-maker/],
      [{ decision_maker: null }, /owner or the decision-maker/],
      [{ contact_verified: false }, /Verify the contact/],
      [{ appointment_confirmed: false }, /date and time/],
      [{ agreed_to_appointment: false }, /agree to an appointment/],
    ];
    for (const [patch, re] of cases) {
      const r = evaluateQualifiable({ ...complete, ...patch }, approved);
      expect(r.ok).toBe(false);
      expect(r.reasons.join(" ")).toMatch(re);
    }
  });

  it("a request for information alone is not a qualified appointment", () => {
    const infoOnly = { ...complete, agreed_to_appointment: false, specialist_interest: "follow_up" as const, appointment_confirmed: null };
    expect(evaluateQualifiable(infoOnly, approved).ok).toBe(false);
    expect(suggestOutcome(infoOnly, approved)).not.toBe("qualified");
  });

  it("records created before the rule keep the earlier requirements", () => {
    const legacy = { ...complete, decision_maker: null, contact_verified: null, appointment_confirmed: null };
    expect(evaluateQualifiable(legacy, approved).ok).toBe(false);
    expect(evaluateQualifiable(legacy, approved, { legacy: true }).ok).toBe(true);
    expect(isLegacyQualification("2026-11-03T12:00:00Z")).toBe(true);
    expect(isLegacyQualification("2026-11-12T12:00:00Z")).toBe(false);
  });

  it("the guide shows a live checklist that turns ready only when everything is confirmed", () => {
    for (const name of CLIENTS) {
      const partial = render(name, { ...FULL, challenges: "More enquiries" });
      expect(partial).toContain("A qualified appointment needs all of these");
      expect(partial).not.toContain("Ready to save as a qualified appointment");
      const ready = render(name, { ...FULL, challenges: "More enquiries", contact_verified: true, appointment_confirmed: true, interested_in_new_or_redesign: "redesign", satisfied_with_site: "not_satisfied", needs_ecommerce: "no", interested_in_seo: "yes" });
      expect(ready).toContain("Ready to save as a qualified appointment");
    }
  });
});

// ---------------------------------------------------------------------------
// Booking-first flow: Yes -> reassure -> offer -> BOOK APPOINTMENT
// ---------------------------------------------------------------------------
describe("booking-first flow", () => {
  const P1 = "That’s excellent! We would love to help your business attract more customers and improve its visibility on Google. Our specialist can explain how we can help you achieve your business goals.";
  const P2 = "The next step is a quick consultation to discuss the opportunities available for your business.";
  const P3 = "Would you prefer a morning or afternoon appointment?";
  const REASSURE = {
    "Teknokraft Canada Inc.": "Our team can discuss ways to strengthen your website, improve your Google search visibility, and help more potential customers discover your business.",
    "Hidebrandt Web Services": "Our team can discuss how website improvements, Google SEO, and Human Search Optimization can help make your business easier for potential customers to discover.",
  } as const;
  const withBook = { onBookAppointment: () => undefined, onRecordOutcome: async () => null, onScheduleFollowUp: async () => null };

  it("Yes immediately shows the recommended response: reassure, then the appointment offer", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!;
      expect(g.google.say.yes).toEqual([P1, REASSURE[name], P2, P3]);
      const html = render(name, { google_interest: "yes" }, withBook);
      expect(html).toContain("Recommended response");
      const idx = g.google.say.yes.map((l) => html.indexOf(esc(l)));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });

  it("the prominent BOOK APPOINTMENT button sits directly below the response, with no discovery questions required first", () => {
    for (const name of CLIENTS) {
      // Nothing else answered: the button is still available and enabled.
      const html = render(name, { google_interest: "yes" }, withBook);
      const button = html.match(/<button[^>]*data-testid="book-appointment"[^>]*>/)?.[0] ?? "";
      expect(button).not.toContain('disabled=""');
      expect(html).toMatch(/Book appointment<\/button>/i);
      const lastLine = html.indexOf(esc(getCallGuide(name)!.google.say.yes[3]));
      expect(html.indexOf('data-testid="book-appointment"')).toBeGreaterThan(lastLine);
      // The discovery questions come after the button, as secondary items.
      expect(html.indexOf("Record remaining requirements")).toBeGreaterThan(html.indexOf('data-testid="book-appointment"'));
      expect(html).toContain("Nothing is booked until you save it");
    }
  });

  it("Tell me more also leads to the appointment offer and BOOK APPOINTMENT; No does not", () => {
    for (const name of CLIENTS) {
      const more = render(name, { google_interest: "more" }, withBook);
      expect(more).toContain('data-testid="book-appointment"');
      expect(more).toContain(esc(getCallGuide(name)!.google.say.more[2]));
      const no = render(name, { google_interest: "no" }, withBook);
      expect(no).not.toContain('data-testid="book-appointment"');
      expect(render(name, {}, withBook)).not.toContain('data-testid="book-appointment"');
    }
  });

  it("without a lead (preview) the button is disabled and says so; clicking never creates anything by itself", () => {
    const html = render("Hidebrandt Web Services", { google_interest: "yes" });
    expect(html.match(/<button[^>]*data-testid="book-appointment"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain("Open a lead to book an appointment.");
  });

  it("offers 'Not ready to book' (follow-up, never an appointment) and a polite No with opt-out handling", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!;
      const yes = render(name, { google_interest: "yes" }, withBook);
      expect(yes).toContain('data-testid="not-ready"');
      expect(g.google.notReady.say).toBe("No problem at all. When would be a good time for me to follow up with you?");
      expect(g.google.notReady.note).toMatch(/never creates or confirms an appointment/i);
      const no = render(name, { google_interest: "no" }, withBook);
      expect(no).toContain('data-testid="record-not-interested"');
      expect(no).toContain('data-testid="record-do-not-call"');
      expect(no).toContain(esc(g.google.optOut.label));
      expect(g.google.optOut.note).toMatch(/Record Do not call/);
      expect(g.google.optOut.note).toMatch(/never contact them again/i);
    }
  });

  it("keeps the secondary questions available after the offer", () => {
    for (const name of CLIENTS) {
      const html = render(name, { google_interest: "yes" }, withBook);
      for (const t of ["Does your business currently receive customers through Google?", "May I ask, does your business currently have a website?", "Business need or growth objective", "Prospect understands the service?", "Is this person the owner or decision-maker?", "Genuine interest, services and business objective"]) expect(html).toContain(esc(t));
    }
  });

  it("never promises rankings, traffic or sales in the new wording", () => {
    for (const name of CLIENTS) {
      const g = getCallGuide(name)!.google;
      const all = [...g.say.yes, ...g.say.more, g.notReady.say, g.notReady.note, g.optOut.note].join(" ");
      expect(all).not.toMatch(/guarantee|first[- ]page|number one|#1|top spot|traffic increase|\d+% |double your/i);
    }
  });
});
