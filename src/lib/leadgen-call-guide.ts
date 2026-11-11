// Lead Generation CRM: client-specific interactive call guide for the two
// website-service clients that use the appointment qualification process
// (Hidebrandt Web Services, Teknokraft Canada Inc.).
//
// Pure and framework-free (like leadgen-call-script.ts) so client components
// build it instantly when the selected client changes. The wording below is
// the Admin-approved script; the only runtime substitutions are the agent's
// first name and the client's name. Other clients (including Web6 Solutions)
// are untouched: getCallGuide() returns null for them and the existing
// script builders keep running exactly as before.

import { agentFirstName } from "@/lib/leadgen-website-script";
import { serviceLabel } from "@/lib/leadgen-qualification";

export type CallGuideBranch = {
  // What the agent says once the prospect answers the website question.
  say: string;
  // Questions to establish on this branch (agent records the answers).
  ask: string[];
};

// A clickable follow-up question in the Google visibility / marketing step.
// `field` is the existing qualification column the answer is saved to.
export type GoogleFollowUp = {
  field: "google_visibility" | "ai_search_interest" | "investing_marketing";
  // Position in the client's approved numbered list (display only).
  number: number;
  label: string;
  options: { value: string; label: string }[];
};

// The Google ranking / marketing step each client's guide opens with. Wording
// is the Admin-approved script; nothing here promises rankings or results.
export type GoogleStep = {
  question: string;
  // Option labels, in the approved order.
  options: { value: "yes" | "more" | "no"; label: string }[];
  // What the agent reads after each answer.
  say: Record<"yes" | "more" | "no", string[]>;
  // Asked after "No": the agent records the answer.
  noFollowUp: string;
  noEnd: string;
  followUps: GoogleFollowUp[];
  // Number + label of the website question in the client's approved list.
  websiteNumber: number;
  specialist: { label: string; options: { value: "yes" | "no" | "follow_up"; label: string }[] };
  // The approved label for the services choice (multiple selections).
  servicesLabel: string;
  booking: string;
};

export type CallGuide = {
  clientKey: "hidebrandt" | "teknokraft";
  clientName: string;
  // Short name used inside the script ("a Hidebrandt website specialist").
  shortName: string;
  // [Agent Name] is substituted by renderGuideLine().
  opening: string[];
  google: GoogleStep;
  // Asked after the Google step (previously the last opening line).
  websitePrompt: string;
  hasWebsite: CallGuideBranch;
  noWebsite: CallGuideBranch;
  ifInterested: string;
  leadGenOnlyPrompt: string;
  // The reminder that follows the lead-generation-only prompt.
  leadGenOnlyOutcome: string;
  // The seven qualification questions every agent works through. Not every
  // answer has to be affirmative: record what applies and confirm genuine
  // interest in at least one approved service.
  qualificationQuestions: string[];
};

// Services shown in previews that have no lead (dashboard card, client page,
// training). They mirror what Admin approved at launch; the lead page always
// uses the client's live settings instead.
export const GUIDE_PREVIEW_SERVICES: Record<CallGuide["clientKey"], string[]> = {
  hidebrandt: ["new_website", "redesign_rebranding", "ecommerce", "seo_visibility", "human_search_optimization"],
  teknokraft: ["new_website", "redesign_rebranding", "seo_visibility"],
};

export const NOT_QUALIFIED_LEAD_GEN_LABEL = "Not Qualified — Lead Generation Only";

const QUALIFICATION_QUESTIONS = [
  "Does the prospect currently have a website?",
  "Is the prospect interested in building or redesigning a website?",
  "Is the prospect satisfied with its design and performance?",
  "Does the prospect need e-commerce functionality? (Only ask if the client offers it.)",
  "Is the prospect interested in SEO or improved search visibility?",
  "What specific website-related service does the prospect want to discuss?",
  "Has the prospect agreed to discuss that service with the client?",
];

const LEAD_GEN_ONLY_PROMPT = "Are you also considering improvements to your website or online visibility to help customers find and contact your business?";
const LEAD_GEN_ONLY_OUTCOME = `If the prospect has no interest in any website-related service, mark the lead "${NOT_QUALIFIED_LEAD_GEN_LABEL}" and do not offer a client appointment.`;

const YES_NO_UNSURE_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

// Compliance: no wording in either Google step may promise a ranking, an AI
// search placement or a lead volume (checked by the tests).
const GUIDES: Record<CallGuide["clientKey"], CallGuide> = {
  hidebrandt: {
    clientKey: "hidebrandt",
    clientName: "Hidebrandt Web Services",
    shortName: "Hidebrandt",
    opening: [
      "Hi, my name is [Agent Name], calling from Winsalot Corp. on behalf of Hidebrandt Web Services.",
      "We help businesses improve their online presence through professional website development, website redesign, and search visibility solutions.",
      "We help businesses improve their online presence through website design, Google search optimization, and Human Search Optimization, helping more potential customers discover their services online.",
    ],
    google: {
      question: "Would you like your business to rank higher on Google and become easier for customers to find when they’re searching online for services like yours?",
      options: [
        { value: "yes", label: "Yes, I’m interested" },
        { value: "more", label: "Tell me more" },
        { value: "no", label: "No, not interested" },
      ],
      say: {
        yes: [
          "That’s excellent! Hidebrandt specializes in helping businesses improve their visibility online through Google SEO and Human Search Optimization.",
          "The goal is to make your business easier for potential customers to discover when searching for your services.",
          "Are you currently doing anything to improve your Google ranking or online visibility?",
        ],
        more: [
          "Of course! Today, people discover businesses through Google, online searches, and AI-powered search tools.",
          "Hidebrandt offers website improvement, SEO, and Human Search Optimization services designed to help businesses become more visible and easier for potential customers to find.",
          "Would you be interested in speaking with a specialist about improving your business’s online visibility?",
        ],
        no: ["No problem at all. May I ask if you’re currently satisfied with how customers find your business online?"],
      },
      noFollowUp: "Currently satisfied with how customers find the business online?",
      noEnd: "If the prospect declines, respect their decision and end the conversation politely.",
      followUps: [
        { field: "google_visibility", number: 1, label: "Are customers currently finding your business through Google?", options: YES_NO_UNSURE_OPTIONS },
        {
          field: "ai_search_interest",
          number: 2,
          label: "Would you like your business to become easier to discover through Google and AI-powered search tools?",
          options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "more", label: "Tell me more" }],
        },
        { field: "investing_marketing", number: 3, label: "Are you currently investing in SEO or digital marketing?", options: YES_NO_UNSURE_OPTIONS },
      ],
      websiteNumber: 4,
      specialist: { label: "Interested in speaking with a Hidebrandt specialist?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "follow_up", label: "Follow up later" }] },
      servicesLabel: "Which services interest you? (select all that apply)",
      booking: "Wonderful! I can schedule a brief consultation with a Hidebrandt specialist to discuss how your business can improve its Google visibility, reach more potential customers, and strengthen its online presence. Would you prefer a morning or afternoon appointment?",
    },
    websitePrompt: "May I ask, does your business currently have a website?",
    hasWebsite: {
      say: "Are you satisfied with how your website looks and performs, or have you considered upgrading it to better showcase your services and attract customers?",
      ask: ["Interested in a redesign or upgrade?", "Satisfied with design and performance?", "Interested in SEO or improved search visibility?", "E-commerce functionality needed? (if offered)"],
    },
    noWebsite: {
      say: "Would you be interested in exploring a professional website that helps customers find your business online and understand your services?",
      ask: ["Interested in a new website?", "Interested in establishing an online presence / search visibility?", "E-commerce functionality needed? (if offered)"],
    },
    ifInterested: "Would you be open to a short consultation with a Hidebrandt website specialist to discuss your specific requirements?",
    leadGenOnlyPrompt: LEAD_GEN_ONLY_PROMPT,
    leadGenOnlyOutcome: LEAD_GEN_ONLY_OUTCOME,
    qualificationQuestions: QUALIFICATION_QUESTIONS,
  },
  teknokraft: {
    clientKey: "teknokraft",
    clientName: "Teknokraft Canada Inc.",
    shortName: "Teknokraft",
    opening: [
      "Hi, my name is [Agent Name], calling from Winsalot Corp. on behalf of Teknokraft Canada Inc.",
      "We help businesses establish and improve their online presence through website development, website redesign, and search engine optimization.",
      "We help businesses improve their visibility on Google, market their services online, and attract more potential customers.",
    ],
    google: {
      question: "Would you like your business to rank higher on Google and reach more customers who are searching for your services?",
      options: [
        { value: "yes", label: "Yes, I’m interested" },
        { value: "no", label: "No, not interested" },
        { value: "more", label: "Tell me more" },
      ],
      say: {
        yes: [
          "That’s great! Teknokraft helps businesses improve their Google search visibility through search engine optimization and digital marketing.",
          "The goal is to help more potential customers discover your business when searching for services like yours.",
          "May I ask, are you currently doing any Google advertising, SEO, or online marketing?",
        ],
        more: [
          "Of course! For example, when someone searches Google for services your company offers, you want your business to appear prominently in those search results.",
          "Teknokraft provides SEO, local search optimization, website improvements, and digital marketing services designed to help more customers find your business.",
          "Would you be interested in a brief consultation to explore how we could improve your Google visibility?",
        ],
        no: ["No problem at all. May I ask whether you’re currently satisfied with the number of customers finding your business online?"],
      },
      noFollowUp: "Currently satisfied with the number of customers finding the business online?",
      noEnd: "If the prospect is satisfied or declines further discussion, politely end the call and respect their preference.",
      followUps: [
        { field: "google_visibility", number: 2, label: "Does your business currently appear on Google when customers search for your services?", options: YES_NO_UNSURE_OPTIONS },
        { field: "investing_marketing", number: 3, label: "Are you currently investing in SEO or digital marketing?", options: YES_NO_UNSURE_OPTIONS },
      ],
      websiteNumber: 4,
      specialist: { label: "Would you like to speak with a Teknokraft specialist about improving your online visibility?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "follow_up", label: "Follow up later" }] },
      servicesLabel: "Which services interest the prospect?",
      booking: "Excellent! I can arrange a brief consultation with a Teknokraft specialist who can discuss ways to improve your Google visibility, promote your services, and help potential customers discover your business. What day and time would be convenient for you?",
    },
    websitePrompt: "May I ask, does your business currently have a website?",
    hasWebsite: {
      say: "Are you happy with your website’s current design and performance, or would you be interested in improving it to attract more customers online?",
      ask: ["Interested in a redesign or improvement?", "Happy with design and performance?", "Interested in SEO or improved search visibility?", "E-commerce functionality needed? (only if Admin has confirmed Teknokraft offers it)"],
    },
    noWebsite: {
      say: "Have you considered creating a professional website so potential customers can find your business and learn more about your services?",
      ask: ["Interested in a new website?", "Interested in establishing an online presence / search visibility?"],
    },
    ifInterested: "We can arrange a short consultation with a Teknokraft representative to discuss your website needs and possible solutions. Would that interest you?",
    leadGenOnlyPrompt: LEAD_GEN_ONLY_PROMPT,
    leadGenOnlyOutcome: LEAD_GEN_ONLY_OUTCOME,
    qualificationQuestions: QUALIFICATION_QUESTIONS,
  },
};

// Matches on the client's name, never an id, so the guide follows the client
// record wherever it is shown. Returns null for every other client.
export function getCallGuide(clientName: string | null | undefined): CallGuide | null {
  const name = (clientName ?? "").trim().toLowerCase();
  if (name === GUIDES.hidebrandt.clientName.toLowerCase()) return GUIDES.hidebrandt;
  if (name === GUIDES.teknokraft.clientName.toLowerCase()) return GUIDES.teknokraft;
  return null;
}

export function renderGuideLine(line: string, agentName: string): string {
  return line.replace(/\[Agent Name\]/gi, agentFirstName(agentName) || "[Agent Name]");
}

// Services the guide offers as "interested in" choices: exactly the services
// the client has Admin-approved (never assumed from the script). Falls back
// to nothing, so a preview with no settings shows no service chips.
export function guideServiceOptions(approvedServices: string[]): { key: string; label: string }[] {
  return approvedServices.map((key) => ({ key, label: serviceLabel(key) }));
}

// The e-commerce question is only asked when the client has e-commerce
// approved (Teknokraft's is off until Admin confirms it).
export function clientOffersEcommerce(approvedServices: string[]): boolean {
  return approvedServices.includes("ecommerce");
}

// The complete read-aloud script plus the qualification checklist, as plain
// text. This is what "Copy Script" copies and what the panels display, so the
// copied and displayed wording can never drift apart.
export function callGuideToText(guide: CallGuide, agentName: string, opts: { offersEcommerce?: boolean } = {}): string {
  const fill = (s: string) => renderGuideLine(s, agentName);
  const offersEcommerce = opts.offersEcommerce ?? guide.clientKey === "hidebrandt";
  const branchAsk = (branch: CallGuideBranch) => branch.ask.filter((q) => offersEcommerce || !/e-commerce/i.test(q)).map((q) => `- ${q}`).join("\n");
  const g = guide.google;
  const optLabels = (opts: { label: string }[]) => opts.map((o) => o.label).join(" / ");
  const googleText = [
    `GOOGLE VISIBILITY QUESTION\n${g.question}\nOptions: ${optLabels(g.options)}`,
    `IF THE PROSPECT SAYS YES\n${g.say.yes.join("\n")}\nThen continue to qualification and appointment booking.`,
    `IF THE PROSPECT SAYS TELL ME MORE\n${g.say.more.join("\n")}`,
    `IF THE PROSPECT SAYS NO\n${g.say.no.join("\n")}\n${g.noEnd}`,
    `GOOGLE VISIBILITY QUALIFICATION (record each answer)\n${g.followUps.map((f) => `${f.number}. ${f.label} (${optLabels(f.options)})`).join("\n")}\n${g.websiteNumber}. Does your business currently have a website? (Yes / No / Not sure)\nConsultation: ${g.specialist.label} (${optLabels(g.specialist.options)})`,
    `APPOINTMENT BOOKING (when the prospect is interested)\n${g.booking}`,
  ].join("\n\n");
  return [
    `OPENING\n${guide.opening.map(fill).join("\n")}`,
    googleText,
    `WEBSITE QUESTION\n${guide.websitePrompt}`,
    `IF THE PROSPECT HAS A WEBSITE\n${guide.hasWebsite.say}\n${branchAsk(guide.hasWebsite)}`,
    `IF THE PROSPECT HAS NO WEBSITE\n${guide.noWebsite.say}\n${branchAsk(guide.noWebsite)}`,
    `IF THE PROSPECT EXPRESSES INTEREST\n${guide.ifInterested}`,
    `IF THE PROSPECT ONLY WANTS LEADS OR CUSTOMERS\n${guide.leadGenOnlyPrompt}\n${guide.leadGenOnlyOutcome}`,
    `QUALIFICATION QUESTIONS (record what applies; genuine interest in at least one approved service is required)\n${guide.qualificationQuestions
      .filter((q) => offersEcommerce || !/e-commerce/i.test(q))
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n")}`,
  ].join("\n\n");
}
