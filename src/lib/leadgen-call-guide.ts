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
  field: "ai_search_interest" | "investing_marketing";
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
  // Step 3: asked right after the Google answer. Saved as google_visibility.
  currentCustomers: { label: string; options: { value: "yes" | "no" | "unsure"; label: string }[] };
  // Step 6: what to say about this client's own services (client-specific).
  servicePitch: { heading: string; say: string[]; agentNote: string };
  // Step 8: owner / decision-maker.
  decisionMaker: { say: string; label: string; options: { value: "yes" | "no" | "unsure"; label: string }[]; ifNot: string };
  // Step 10: confirm the details and record the specific requirements.
  confirmation: { say: string[]; contactLabel: string; scheduleLabel: string; requirementsLabel: string };
};

// One expandable objection response. `responses` is read aloud; `note` is for
// the agent only and is never read to the prospect.
export type ObjectionItem = { id: string; label: string; responses: string[]; note?: string };

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
  objections: ObjectionItem[];
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

const YES_NO_UNSURE_OPTIONS: { value: "yes" | "no" | "unsure"; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

// Compliance: no wording in either Google step may promise a ranking, an AI
// search placement or a lead volume (checked by the tests).
// Expandable objection responses (read aloud). Shared structure, with the
// client's own services and name substituted so each script stays separate.
// Nothing here quotes prices or promises rankings, AI placement or lead
// volumes, and a request for information alone is never an appointment.
function buildObjections(c: { name: string; website: string; hasSomeone: string }): ObjectionItem[] {
  return [
    {
      id: "has-website",
      label: "We already have a website.",
      responses: [
        "That’s great, a website is a strong foundation. What we look at is whether it is helping customers find and contact you, for example when they search on Google.",
        `${c.name} ${c.website}`,
        "Would you be open to a brief consultation to see whether there is room to improve how your website attracts customers?",
      ],
    },
    {
      id: "on-google",
      label: "We already appear on Google.",
      responses: [
        "That’s good to hear. Do the people finding you through Google turn into the customers you want, and for the services you most want to be found for?",
        `Appearing in search results and being found by the right customers are not always the same thing. ${c.name} can take a look at where your business stands and what could improve it. I can’t promise any specific result, but a consultation will show you the options.`,
        "Would you like to set up a brief consultation?",
      ],
    },
    {
      id: "not-interested",
      label: "We are not interested.",
      responses: [
        "No problem at all, and I appreciate your time. May I ask whether you’re currently satisfied with the number of customers finding your business online?",
      ],
      note: "If they are satisfied or decline further discussion, thank them, end the call politely and respect their decision. Do not push. Offer the consultation once only if they show any hesitation or interest.",
    },
    {
      id: "no-budget",
      label: "We don’t have a budget.",
      responses: [
        "I understand, and I’m not asking you to commit to anything today. The consultation is a conversation about your goals and what would make sense for your business, so you can decide whether and when to go further.",
        "Would it be useful to learn what the options are, even if the timing isn’t right yet?",
      ],
      note: "Do not quote prices, ranges or discounts. If they want to be contacted later, record Follow up later.",
    },
    {
      id: "send-info",
      label: "Send me information by email.",
      responses: [
        "I’d be happy to. So I send you something relevant, what would you most like to know about: your Google visibility, your website, or marketing?",
        "A short consultation is usually more useful, because the specialist can tailor it to your business. Would you like to schedule one, and I can also send you a summary by email?",
      ],
      note: "A request for information is NOT a confirmed appointment: mark it Needs follow-up unless the prospect also accepts an appointment. Only email an address the prospect has given and confirmed, and only if they agree to receive it. Respect Do Not Call, email opt-out and consent flags on the lead; never contact anyone who has opted out.",
    },
    {
      id: "have-marketing",
      label: "We already have someone handling our marketing.",
      responses: [
        "That’s good to hear. Is that someone in-house, or an outside company?",
        `We’re not suggesting replacing anyone. ${c.hasSomeone}`,
        "Would it be useful to get a second opinion in a brief consultation?",
      ],
    },
    {
      id: "cost",
      label: "How much does it cost?",
      responses: [
        "It depends on what your business needs, such as which services and how much work is involved, so I don’t want to guess and mislead you.",
        `A ${c.name} specialist can discuss your goals and explain the options, including pricing, during the consultation. Can we find a time that works?`,
      ],
      note: "Never quote a price, range or package. Pricing is discussed by the specialist.",
    },
  ];
}

const GUIDES: Record<CallGuide["clientKey"], CallGuide> = {
  hidebrandt: {
    clientKey: "hidebrandt",
    clientName: "Hidebrandt Web Services",
    shortName: "Hidebrandt",
    opening: [
      "Hi, my name is [Agent Name], calling from Winsalot Corp. on behalf of Hidebrandt Web Services. We help businesses improve their Google visibility and attract more customers through website improvements and search optimization.",
    ],
    google: {
      question: "Would you like your business to appear higher on Google when customers search for your services, so more people can find you and contact you?",
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
        {
          field: "ai_search_interest",
          number: 1,
          label: "Would you like your business to become easier to discover through Google and AI-powered search tools?",
          options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "more", label: "Tell me more" }],
        },
        { field: "investing_marketing", number: 2, label: "Are you currently investing in SEO or digital marketing?", options: YES_NO_UNSURE_OPTIONS },
      ],
      websiteNumber: 4,
      specialist: { label: "Interested in speaking with a Hidebrandt specialist?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "follow_up", label: "Follow up later" }] },
      servicesLabel: "Which services interest you? (select all that apply)",
      booking: "Wonderful! I can schedule a brief consultation with a Hidebrandt specialist to discuss how your business can improve its Google visibility, reach more potential customers, and strengthen its online presence. Would you prefer a morning or afternoon appointment?",
      currentCustomers: { label: "Does your business currently receive customers through Google?", options: YES_NO_UNSURE_OPTIONS },
      servicePitch: {
        heading: "Hidebrandt services to discuss",
        say: [
          "Hidebrandt helps businesses with website redesign, Human Search Optimization, and improved search visibility, with the goal of attracting relevant customers who are looking for what you offer.",
          "Human Search Optimization is Hidebrandt’s own service. It looks at how potential customers search and what they are looking for, so the right people can find your business. It is separate from traditional SEO.",
        ],
        agentNote: "Hidebrandt’s emphasis: website redesign, Human Search Optimization, improved search visibility, attracting relevant customers. HSO and traditional SEO are different services: never say they are the same or interchangeable. Do not promise rankings, AI search placement or lead volumes, and do not invent technical details; the specialist explains scope.",
      },
      decisionMaker: {
        say: "May I ask, are you the owner, or the person who makes the decisions about your website and marketing?",
        label: "Is this person the owner or decision-maker?",
        options: [{ value: "yes", label: "Yes, owner / decision-maker" }, { value: "no", label: "No, someone else" }, { value: "unsure", label: "Not sure" }],
        ifNot: "Ask who the right person is and when they are available. Record the name and follow up. Do not book the appointment until the appropriate contact has accepted it.",
      },
      confirmation: {
        say: [
          "Let me confirm your details so the Hidebrandt specialist can reach you: your name, the best phone number, and your email address.",
          "And what would you most like the consultation to cover?",
        ],
        contactLabel: "Contact name, phone number and email address verified?",
        scheduleLabel: "Appointment date and time confirmed with the prospect?",
        requirementsLabel: "Specific requirements (what the prospect wants the consultation to cover, in their own words)",
      },
    },
    objections: buildObjections({
      name: "Hidebrandt",
      website: "can review how your website supports your business, and offers website redesign and Human Search Optimization to help the right potential customers find and contact you.",
      hasSomeone: "Hidebrandt’s website redesign and Human Search Optimization services can sit alongside what is already being done, and a consultation would show where they could help.",
    }),
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
      "Hi, my name is [Agent Name], calling from Winsalot Corp. on behalf of Teknokraft Canada Inc. We help businesses attract more potential customers through website design and redesign, Google search visibility, SEO, and digital marketing.",
    ],
    google: {
      question: "Would you like your business to appear higher on Google when customers search for your services, so more people can find you and contact you?",
      options: [
        { value: "yes", label: "Yes, I’m interested" },
        { value: "more", label: "Tell me more" },
        { value: "no", label: "No, not interested" },
      ],
      say: {
        yes: [
          "That’s great! Teknokraft helps businesses improve their Google search visibility through search engine optimization, local search visibility, and digital marketing.",
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
        { field: "investing_marketing", number: 1, label: "Are you currently investing in SEO or digital marketing?", options: YES_NO_UNSURE_OPTIONS },
      ],
      websiteNumber: 4,
      specialist: { label: "Would you like to speak with a Teknokraft specialist about improving your online visibility?", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "follow_up", label: "Follow up later" }] },
      servicesLabel: "Which services interest the prospect?",
      booking: "Excellent! I can arrange a brief consultation with a Teknokraft specialist who can discuss ways to improve your Google visibility, promote your services, and help potential customers discover your business. What day and time would be convenient for you?",
      currentCustomers: { label: "Does your business currently receive customers through Google?", options: YES_NO_UNSURE_OPTIONS },
      servicePitch: {
        heading: "Teknokraft services to discuss",
        say: [
          "Teknokraft helps businesses with website development, website redesign, search engine optimization, and digital marketing, to increase online visibility so more potential customers can find and contact your business.",
        ],
        agentNote: "Teknokraft’s emphasis: website development, website redesign, SEO, digital marketing, increased online visibility. Do not promise rankings or lead volumes, and do not invent technical details or pricing; the specialist explains scope.",
      },
      decisionMaker: {
        say: "May I ask, are you the owner, or the person who makes the decisions about your website and marketing?",
        label: "Is this person the owner or decision-maker?",
        options: [{ value: "yes", label: "Yes, owner / decision-maker" }, { value: "no", label: "No, someone else" }, { value: "unsure", label: "Not sure" }],
        ifNot: "Ask who the right person is and when they are available. Record the name and follow up. Do not book the appointment until the appropriate contact has accepted it.",
      },
      confirmation: {
        say: [
          "Let me confirm your details so the Teknokraft specialist can reach you: your name, the best phone number, and your email address.",
          "And what would you most like the consultation to cover?",
        ],
        contactLabel: "Contact name, phone number and email address verified?",
        scheduleLabel: "Appointment date and time confirmed with the prospect?",
        requirementsLabel: "Specific requirements (what the prospect wants the consultation to cover, in their own words)",
      },
    },
    objections: buildObjections({
      name: "Teknokraft",
      website: "can review how your website supports your business, and offers website redesign, SEO, and digital marketing to help more potential customers find and contact you.",
      hasSomeone: "Teknokraft’s website, SEO, and digital marketing services can complement what is already being done, and a consultation would show where they could help.",
    }),
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
  return [
    `1. PROFESSIONAL INTRODUCTION\n${guide.opening.map(fill).join("\n")}`,
    `2. GOOGLE VISIBILITY QUESTION (ask this first, before anything about a website)\n${g.question}\nOptions: ${optLabels(g.options)}\n\nIF THE PROSPECT SAYS YES\n${g.say.yes.join("\n")}\n\nIF THE PROSPECT SAYS TELL ME MORE\n${g.say.more.join("\n")}\n\nIF THE PROSPECT SAYS NO\n${g.say.no.join("\n")}\n${g.noEnd}`,
    `3. CUSTOMERS THROUGH GOOGLE\n${g.currentCustomers.label} (${optLabels(g.currentCustomers.options)})`,
    `4. DOES THE PROSPECT HAVE A WEBSITE?\n${guide.websitePrompt}`,
    `5. DOES THE WEBSITE NEED IMPROVEMENT OR REBRANDING?\nIF THE PROSPECT HAS A WEBSITE\n${guide.hasWebsite.say}\n${branchAsk(guide.hasWebsite)}\n\nIF THE PROSPECT HAS NO WEBSITE\n${guide.noWebsite.say}\n${branchAsk(guide.noWebsite)}`,
    `6. ${g.servicePitch.heading.toUpperCase()}\n${g.servicePitch.say.join("\n")}\n${g.followUps.map((f) => `- ${f.label} (${optLabels(f.options)})`).join("\n")}\nAgent note (do not read aloud): ${g.servicePitch.agentNote}`,
    `7. GENUINE CUSTOMER INTEREST\nRecord the services the prospect is interested in, that they understand them, and their business need or growth objective. (${g.servicesLabel})`,
    `8. OWNER OR DECISION-MAKER\n${g.decisionMaker.say}\nOptions: ${optLabels(g.decisionMaker.options)}\nAgent note (do not read aloud): ${g.decisionMaker.ifNot}`,
    `9. OFFER A CONSULTATION\n${guide.ifInterested}\n${g.specialist.label} (${optLabels(g.specialist.options)})\n\nWHEN THE PROSPECT AGREES\n${g.booking}`,
    `10. CONFIRM THE APPOINTMENT AND RECORD REQUIREMENTS\n${g.confirmation.say.join("\n")}\nRecord: ${g.confirmation.contactLabel} ${g.confirmation.scheduleLabel} ${g.confirmation.requirementsLabel}`,
    `OBJECTION HANDLING\n${guide.objections.map((o) => `"${o.label}"\n${o.responses.join("\n")}${o.note ? `\nAgent note (do not read aloud): ${o.note}` : ""}`).join("\n\n")}`,
    `IF THE PROSPECT ONLY WANTS LEADS OR CUSTOMERS\n${guide.leadGenOnlyPrompt}\n${guide.leadGenOnlyOutcome}`,
    `A QUALIFIED APPOINTMENT NEEDS ALL OF THESE\n- Genuine interest in at least one service ${guide.shortName} offers\n- A relevant business need or growth objective\n- The appointment accepted by the owner or appropriate decision-maker\n- Contact information verified\n- Appointment date and time confirmed\nA request for information alone is not a confirmed appointment.`,
    `QUALIFICATION QUESTIONS (record what applies; genuine interest in at least one approved service is required)\n${guide.qualificationQuestions
      .filter((q) => offersEcommerce || !/e-commerce/i.test(q))
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n")}`,
  ].join("\n\n");
}
