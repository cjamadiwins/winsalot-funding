// Lead Generation CRM: the standard approved website-services call script.
// Pure and framework-free (like leadgen-call-script.ts) so client components
// can build it instantly. Nothing here is client-specific wording: the only
// values that change between campaigns are the logged-in agent's first name
// and the client attached to the call list (Client -> Campaign/List -> Agent).

export const WEBSITE_SERVICES_CLIENT_NAMES = ["Hidebrandt Web Services", "Teknokraft Canada Inc.", "Web6 Solutions"] as const;
const WEBSITE_SERVICE_PATTERN = /website|web design|web development|seo|e-commerce/i;

// The approved opening. It deliberately never says the business lacks a
// website, so it is identical for No Website / Needs Review / Existing /
// uncertain imported leads.
export const WEBSITE_SERVICES_OPENING_TEMPLATE =
  "Hi, my name is [Agent Name] from Winsalot Corp., calling on behalf of [Client Name]. I came across your website and wanted to reach out because we help businesses generate more leads and rebrand their websites so they better showcase their work. Would you be open to a quick conversation about that?";

export function agentFirstName(fullNameOrEmail: string): string {
  const trimmed = fullNameOrEmail.trim();
  if (!trimmed) return "";
  // A literal "[Agent Name]" placeholder (no agent in context) stays whole.
  if (trimmed.startsWith("[")) return trimmed;
  const base = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  return base.split(/\s+/)[0] ?? "";
}

export function renderWebsiteServicesOpening(agentName: string, clientName: string): string {
  const agent = agentFirstName(agentName) || "[Agent Name]";
  return WEBSITE_SERVICES_OPENING_TEMPLATE.replace("[Agent Name]", agent).replace("[Client Name]", clientName.trim() || "[Client Name]");
}

// A campaign is website-services when its client is one of the launch
// clients or its own described services say so.
export function isWebsiteServicesCampaign(input: {
  clientName: string;
  services?: string | null;
  campaignServiceType?: string | null;
  campaignDescription?: string | null;
}): boolean {
  if ((WEBSITE_SERVICES_CLIENT_NAMES as readonly string[]).includes(input.clientName)) return true;
  return WEBSITE_SERVICE_PATTERN.test([input.services, input.campaignServiceType, input.campaignDescription].filter(Boolean).join(" "));
}

export type WebsiteServicesScript = {
  opening: string;
  clientName: string;
  campaignLabel: string;
  industry: string | null;
  qualificationQuestions: string[];
  talkingPoints: string[];
  objections: { objection: string; response: string }[];
  cta: { line: string; steps: string[] };
  clientNotes: string | null;
  // Admin-written additional approved wording for this list/client, shown
  // after the standard sections - never replaces the standard opening.
  adminScript: string | null;
};

export function buildWebsiteServicesScript(input: {
  agentName: string;
  clientName: string;
  campaignLabel?: string | null;
  industry?: string | null;
  services?: string | null;
  notes?: string | null;
  closing?: string | null;
  adminScript?: string | null;
}): WebsiteServicesScript {
  const client = input.clientName.trim();
  const industry = input.industry?.trim() || null;
  const services = input.services?.trim() || "website design, redesign and online visibility";
  const about = industry ? `${industry.toLowerCase()} businesses` : "local businesses";
  const agent = agentFirstName(input.agentName) || "[Agent Name]";
  const fill = (text: string) =>
    text.replace(/\[Agent Name\]/gi, agent).replace(/\[Client (Business )?Name\]/gi, client).replace(/\[Prospect Business Name\]/gi, "[Prospect Business Name]");
  const adminScript = input.adminScript?.trim() ? fill(input.adminScript.trim()) : null;
  const closing = input.closing?.trim() ? fill(input.closing.trim()) : null;

  return {
    opening: renderWebsiteServicesOpening(input.agentName, client),
    clientName: client,
    campaignLabel: input.campaignLabel?.trim() || client,
    industry,
    qualificationQuestions: [
      "Who is the best person to speak with about your website and marketing?",
      "How do you get most of your new customers or inquiries today?",
      "How is your website working for you — does it bring in calls or inquiries?",
      "Does your website show off the quality of your work and your current services?",
      `Are you looking to improve, redesign or rebrand your website in the near future?`,
    ],
    talkingPoints: [
      `${client} helps ${about} with ${services}.`,
      "A stronger website can bring in more leads and better show the quality of your work.",
      "Keep it short and conversational; let the prospect talk about their business first.",
      "Do not assume the prospect has, or does not have, a website. Ask about it.",
      "Do not promise results, guaranteed sales or conversions. Quote only pricing approved for this campaign.",
    ],
    objections: [
      { objection: "“We already have a website.”", response: "That’s great. Are you happy with how it looks, how it performs and how many inquiries it brings in?" },
      { objection: "“Not interested.”", response: "Understood. Thank you for your time. Have a good day." },
      { objection: "“Send me information.”", response: "Of course. What is the best email address? (Then use the existing campaign email workflow.)" },
      { objection: "“How much does it cost?”", response: `It depends on your needs. ${client} can go over options during a short consultation.` },
    ],
    cta: {
      line: closing ?? `Would you be open to a short consultation with ${client}? Would [day/time] work?`,
      steps: ["Confirm the best contact and a day/time.", "Book it through the existing appointment workflow.", "Log the call outcome."],
    },
    clientNotes: input.notes?.trim() || null,
    adminScript,
  };
}

// Plain-text version for "Copy Script".
export function websiteServicesScriptToText(script: WebsiteServicesScript): string {
  return [
    script.opening,
    `Qualification questions:\n${script.qualificationQuestions.map((q) => `- ${q}`).join("\n")}`,
    `Key talking points:\n${script.talkingPoints.map((t) => `- ${t}`).join("\n")}`,
    `Objection handling:\n${script.objections.map((o) => `- ${o.objection} ${o.response}`).join("\n")}`,
    `Appointment:\n${script.cta.line}`,
    script.adminScript,
  ]
    .filter(Boolean)
    .join("\n\n");
}
