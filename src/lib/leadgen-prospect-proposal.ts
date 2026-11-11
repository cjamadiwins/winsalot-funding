// Prospect proposal for a Teknokraft Canada Inc. lead, prepared by Winsalot
// Corp. on Teknokraft's behalf and kept as a DRAFT for Admin review.
//
// Pure and framework-free so the PDF, the Admin preview, the email draft and
// the tests all read the same content. Rules baked in here (and asserted by
// the tests):
//   - Only facts the CRM actually holds are stated as facts. Nothing about the
//     prospect's website is assumed: if a site is on file the proposal says so
//     and proposes a REVIEW first; it never says a new site is needed.
//   - Only services Admin has approved for the client appear (the approved
//     list comes from the client's qualification settings).
//   - No pricing, timelines, rankings, traffic, lead-volume or sales promises.

export type ProposalSection = { heading: string; paragraphs?: string[]; bullets?: string[] };

export type ProspectProposalContent = {
  version: 1;
  title: string;
  clientName: string;
  preparedBy: string;
  preparedOn: string; // YYYY-MM-DD
  preparedFor: { business: string; contact: string | null; location: string | null; industry: string | null; website: string | null };
  intro: string[];
  whatWeKnow: string[];
  sections: ProposalSection[];
  nextStep: { heading: string; paragraphs: string[]; bookingUrl: string | null; bookingLabel: string };
  disclaimer: string[];
};

export type ProspectProposalInput = {
  lead: {
    business_name: string;
    contact_name: string | null;
    city: string | null;
    province: string | null;
    industry: string | null;
    // The lead's own website field, or the website from the call list it was imported from.
    website: string | null;
  };
  client: { name: string; booking_link: string | null; services_info_link: string | null };
  // Services Admin approved for this client (qualification settings keys).
  approvedServices: string[];
  // Facts recorded on the lead, shown to the prospect only when true. Each is
  // a short statement such as "You asked us to send information by email."
  verifiedFacts: string[];
  preparedOn: string;
};

// "Teknokraft Canada Inc." already ends with a period: never double it.
function sentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function properName(name: string | null): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "") + (u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/$/, "") : "");
  } catch {
    return url.trim() || null;
  }
}

export function proposalFilename(businessName: string): string {
  const slug = businessName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "Prospect";
  return `Teknokraft-Proposal-${slug}.pdf`;
}

export function buildProspectProposal(input: ProspectProposalInput): { content: ProspectProposalContent; emailSubject: string; emailBody: string; filename: string } {
  const { lead, client } = input;
  const approved = new Set(input.approvedServices);
  const business = lead.business_name.trim();
  const contact = properName(lead.contact_name);
  const location = [lead.city, lead.province].map((s) => (s ?? "").trim()).filter(Boolean).join(", ") || null;
  const industry = (lead.industry ?? "").trim() || null;
  const site = (lead.website ?? "").trim() || null;
  const siteHost = hostOf(site);
  const city = (lead.city ?? "").trim() || "your area";
  const trade = (industry ?? "").toLowerCase() === "plumbing" ? "plumbing" : (industry ?? "").toLowerCase() || "your";

  const websiteIsOffered = approved.has("new_website") || approved.has("redesign_rebranding");
  const seoIsOffered = approved.has("seo_visibility");
  const marketingIsOffered = approved.has("digital_marketing");

  const whatWeKnow = [
    `Business: ${business}${industry ? ` (${industry})` : ""}${location ? `, ${location}` : ""}`,
    ...(contact ? [`Contact: ${contact}`] : []),
    ...(siteHost ? [`Website on file: ${siteHost}`] : ["Website: not confirmed. We would confirm whether you have one before recommending anything."]),
    ...input.verifiedFacts,
  ];

  const sections: ProposalSection[] = [];
  if (websiteIsOffered) {
    sections.push({
      heading: "1. Website development and improvement",
      paragraphs: [
        `A modern, mobile-friendly website helps a ${trade} business show the services it offers, build trust with customers, and make it simple to get in touch.`,
        siteHost
          ? `Because ${business} already has a website (${siteHost}), we would start by reviewing it, not assuming anything needs to change. We have not reviewed it in detail yet.`
          : `We would first confirm whether ${business} has a website today, and recommend only what fits your situation.`,
      ],
      bullets: [
        "A review of how clearly the website presents your services and service area, how it works on a phone, and how easy it is for customers to call or request service",
        "Clear pages for the services you actually offer, written the way customers search for them",
        "Trust builders such as your service area, licensing, reviews and photos, where you choose to share them",
        "Prominent calls to action: tap-to-call, a simple service request form, and clear contact details",
        "Mobile-friendly design and fast page loading",
        "Recommendations ranging from targeted improvements to a redesign, decided together after the review",
      ],
    });
  }
  if (seoIsOffered) {
    sections.push({
      heading: `${sections.length + 1}. Google search engine optimization (SEO)`,
      paragraphs: [`SEO is about helping the right customers find ${business} when they search Google for the services you provide. Potential improvements include:`],
      bullets: [
        `Local SEO targeting ${city}: service-area content and consistent business details so Google understands where you work`,
        `Relevant ${trade} service keywords: research into how local customers search, used naturally in your pages`,
        "Google Business Profile optimization: a complete, accurate profile with the right categories, services, hours and photos, and a simple process for asking happy customers for reviews",
        "Improved website visibility in local searches, so more of the people looking for your services can find you",
        "Technical and on-page SEO: page titles and descriptions, headings, internal links, mobile usability, page speed and structured data",
      ],
    });
  }
  if (marketingIsOffered) {
    sections.push({
      heading: `${sections.length + 1}. Digital marketing`,
      paragraphs: ["Beyond organic search, online marketing can help reach customers who are ready to call a plumber. Where appropriate, options could include:"],
      bullets: [
        `Google Ads (search advertising) aimed at ${city} service searches. Advertising spend would be set by you and paid to Google separately`,
        "Focused landing pages for key services, so people who click an ad find the right information and an easy way to contact you",
        "Google Business Profile updates and a review-request routine",
        "Tracking calls and service requests, so decisions are based on what is actually working",
      ],
    });
  }

  const benefitBullets = [
    `Attract more local customers in ${city}`,
    "Increase your online visibility",
    `Generate more ${trade} service inquiries`,
    "Make it easier for customers to call or request service",
  ];
  sections.push({
    heading: `${sections.length + 1}. How this can help ${business}`,
    paragraphs: ["The aim of the work above is to help you:"],
    bullets: benefitBullets,
  });
  sections.push({
    heading: `${sections.length + 1}. A simple way to start`,
    bullets: [
      "A consultation to understand your goals, the services you want to be found for, and where you work",
      "A review of your current website and Google presence",
      "Prioritized recommendations, with scope, timing and investment confirmed by Teknokraft",
      "You decide whether and how to proceed after the review",
    ],
    paragraphs: ["This proposal does not include pricing. Teknokraft provides scope and pricing after the consultation, once your needs are clear."],
  });

  const bookingUrl = client.booking_link?.trim() || null;
  const content: ProspectProposalContent = {
    version: 1,
    title: "Website, Google Visibility and Digital Marketing Proposal",
    clientName: client.name,
    preparedBy: `Winsalot Corp., on behalf of ${client.name}`,
    preparedOn: input.preparedOn,
    preparedFor: { business, contact, location, industry, website: siteHost },
    intro: [
      `Thank you for your interest in ${sentence(client.name)} This proposal outlines how ${client.name} could help ${business} attract more local customers, increase its online visibility, and make it easier for customers to call or request service.`,
      "It is based on what we know today, listed below. Nothing here assumes a problem with your current website or online presence; the first step is a conversation and a review.",
    ],
    whatWeKnow,
    sections,
    nextStep: {
      heading: "Next step: schedule a consultation",
      paragraphs: [
        `We would welcome the chance to speak with you${contact ? `, ${contact}` : ""}. A short consultation lets us understand your goals and look at your current website and Google presence together.`,
        bookingUrl ? "Choose a time that suits you using the link below, or reply to the email that brought you this proposal." : "Reply to the email that brought you this proposal and we will arrange a time that suits you.",
      ],
      bookingUrl,
      bookingLabel: "Schedule a consultation",
    },
    disclaimer: [
      `${client.name} does not guarantee any specific Google ranking, search position, website traffic, number of inquiries or sales result. Outcomes depend on many factors, including competition, the local market and your own services and reviews.`,
      "The services and approach described are options for discussion. Scope, timing and pricing are confirmed by Teknokraft before any work begins.",
    ],
  };

  const first = contact ?? "there";
  const emailSubject = `Proposal for ${business} from ${client.name}`;
  const lines: string[] = [
    `Hi ${first},`,
    "",
    `Thank you for speaking with our team and for your interest in ${sentence(client.name)} As you asked for information by email, a proposal for ${business} is attached.`,
    "",
    `It outlines how ${client.name} could help ${business}:`,
    "",
    ...(websiteIsOffered ? [siteHost ? "• Review and improve your existing website so it works well on a phone and makes it easy to call or request service" : "• Confirm your website needs and recommend only what fits"] : []),
    ...(seoIsOffered ? [`• Strengthen your Google visibility in ${city} with local SEO, Google Business Profile optimization and relevant ${trade} keywords`] : []),
    ...(marketingIsOffered ? ["• Explore online marketing options, including Google Ads where appropriate, to reach customers searching for your services"] : []),
    "",
    "The proposal does not include pricing, and we do not promise specific rankings or results. The next step would be a short consultation to understand your goals and review your current website and Google presence.",
  ];
  if (bookingUrl) {
    lines.push("", "You can choose a time that suits you here:", "", "[Schedule a consultation]", "", bookingUrl);
  } else {
    lines.push("", "Reply to this email and we will arrange a time that suits you.");
  }
  if (client.services_info_link?.trim()) lines.push("", `You can learn more about ${client.name} here:`, "", `[Visit ${client.name}]`, "", client.services_info_link.trim());
  lines.push("", "Best regards,", "", "Winsalot Corp.", `On behalf of ${client.name}`);

  return { content, emailSubject, emailBody: lines.join("\n"), filename: proposalFilename(business) };
}

// Statements the CRM can back up, derived from the lead's logged calls. Shown
// to the prospect, so only what the record clearly supports is stated.
export function verifiedFactsFromCalls(calls: { outcome: string | null; notes: string | null }[]): string[] {
  const interested = calls.filter((c) => /interested|information requested|callback requested/i.test(c.outcome ?? "") && !/not interested/i.test(c.outcome ?? ""));
  if (interested.length === 0) return [];
  const askedForEmail = interested.some((c) => /e-?mail/i.test(c.notes ?? ""));
  return [askedForEmail ? "You spoke with our team and asked us to send information by email." : "You spoke with our team and expressed interest in learning more."];
}

// The text a reviewer or a test reads end to end (everything the prospect sees).
export function proposalPlainText(c: ProspectProposalContent, emailBody?: string): string {
  return [
    c.title,
    c.preparedBy,
    ...c.intro,
    ...c.whatWeKnow,
    ...c.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])]),
    c.nextStep.heading,
    ...c.nextStep.paragraphs,
    ...c.disclaimer,
    emailBody ?? "",
  ].join("\n");
}
