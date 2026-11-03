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

export type CallGuide = {
  clientKey: "hidebrandt" | "teknokraft";
  clientName: string;
  // Short name used inside the script ("a Hidebrandt website specialist").
  shortName: string;
  // [Agent Name] is substituted by renderGuideLine().
  opening: string[];
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

const GUIDES: Record<CallGuide["clientKey"], CallGuide> = {
  hidebrandt: {
    clientKey: "hidebrandt",
    clientName: "Hidebrandt Web Services",
    shortName: "Hidebrandt",
    opening: [
      "Hi, my name is [Agent Name], calling from Winsalot Corp. on behalf of Hidebrandt Web Services.",
      "We help businesses improve their online presence through professional website development, website redesign, and search visibility solutions.",
      "May I ask, does your business currently have a website?",
    ],
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
      "May I ask, does your business currently have a website?",
    ],
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
  return [
    `OPENING\n${guide.opening.map(fill).join("\n")}`,
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
