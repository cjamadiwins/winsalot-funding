// Built-in "Website Redesign + Human Search Optimization (HSO)" appointment
// brief layout for Hidebrandt Web Services. Pure data/helpers (no server-only
// imports) so the Admin modal, the PDF renderer and tests share one source.
// Applying it only fills the editable Prepare Appointment fields - Admin
// reviews/edits, and nothing is saved or sent automatically.

export const BRIEF_TEMPLATE_WEBSITE_HSO = "website_redesign_hso";
export const BRIEF_PREPARED_BY = "Prepared by Winsalot Corp. for Hidebrandt Web Services";

export type BriefTemplateFields = {
  why_interested: string;
  primary_opportunity: string;
  main_interest: string;
  primary_need: string;
  interest_level: string;
  recommended_objective: string;
  talking_points: string;
  suggested_questions: string;
  recommended_next_step: string;
  next_step_note: string;
};

export const WEBSITE_REDESIGN_OBJECTIVES = [
  "Modernize the company's website",
  "Improve visual appearance and branding",
  "Improve mobile responsiveness",
  "Make navigation easier for visitors",
  "Introduce stronger calls to action to encourage inquiries and conversions",
] as const;

// Human Search Optimization (HSO) is Hidebrandt Web Services' own service -
// it is deliberately not described as conventional SEO.
export const HSO_OBJECTIVES = [
  "Improve how potential customers discover the business online",
  "Optimize website content around customer search behaviour and intent",
  "Help attract relevant visitors and qualified business inquiries",
  "Improve the customer journey from discovery to contacting the business",
  "Complement the redesigned website with lead-generation-focused content",
] as const;

export const COMBINED_SOLUTION_SUMMARY =
  "Website Redesign and Human Search Optimization work as one lead-generation approach. HSO helps the right potential customers find the business and shapes content around what they search for and why. The redesigned website then gives those visitors a modern, mobile-friendly, easy-to-navigate experience with clear calls to action, so interest turns into inquiries. Each supports the other: discovery without a strong website loses visitors, and a strong website without discovery is rarely seen. No pricing, lead volumes or results are assumed or promised in this brief; scope is confirmed during the consultation.";

export const EXPECTED_OUTCOMES = [
  "Confirm the prospect's goals, priorities and the pages or services that matter most",
  "Agree how website redesign and HSO fit together for the business's target customers",
  "Agree the next step, timeline and any information needed from the prospect",
] as const;

export const RECOMMENDED_NEXT_STEPS = [
  "Summarize what was discussed and confirm the priorities with the prospect",
  "Prepare a proposal covering website redesign and HSO once scope is confirmed",
  "Collect any outstanding information (current website, services, target areas)",
  "Schedule a follow-up consultation to review the proposal",
] as const;

export function buildWebsiteHsoTemplate(input: { businessName: string; contactName: string | null }): BriefTemplateFields {
  const who = input.contactName?.trim() || "the owner";
  return {
    why_interested: `${who} is interested in improving ${input.businessName}'s online presence, attracting more potential customers and generating qualified business leads, through two services: Website Redesign and Human Search Optimization (HSO).`,
    primary_opportunity: "Website redesign + Human Search Optimization",
    main_interest: "Website Redesign / Human Search Optimization (HSO)",
    primary_need: "Improve online presence and generate qualified business leads",
    interest_level: "High",
    recommended_objective: "Understand project scope and secure a proposal opportunity",
    talking_points: [
      "Website redesign: modern look and branding, mobile-friendly, easier navigation, stronger calls to action",
      "HSO: help the right potential customers discover the business and reach out",
      "Content built around customer search behaviour and intent",
      "Improving the customer journey from discovery to contacting the business",
      "How redesign and HSO work together to attract and convert potential customers",
    ].join("\n"),
    suggested_questions: [
      "What do you like and dislike about your current website, and how do you see it representing your brand?",
      "What do you want visitors to do on the website, and how do they contact you today?",
      "Who are your ideal customers, and which services or project types matter most?",
      "How do potential customers find you now, and what do they search for?",
      "How many inquiries do you receive today, and how many are the right fit?",
      "What timeline do you have in mind, and what else should we know before proposing a plan?",
    ].join("\n"),
    recommended_next_step: "Send Proposal",
    next_step_note: "Confirm scope and timeline, then send a combined website redesign + HSO proposal.",
  };
}

// ---------------------------------------------------------------------------
// Teknokraft Canada Inc. - "Google Visibility + Local SEO" brief layout.
// Additive: nothing above this line is changed, so the Hidebrandt Website
// Redesign + HSO template, its branding line and its PDF sections are exactly
// as before. Reusable for any qualified lead whose primary need is being
// found on Google (Search, Maps, Google Business Profile) - pass the lead's
// industry / service area when known, otherwise the copy stays generic.
// Client-safe only: no internal notes, agent notes or CRM metadata.
// ---------------------------------------------------------------------------
export const BRIEF_TEMPLATE_TEKNOKRAFT_GOOGLE = "teknokraft_google_local_seo";
export const BRIEF_PREPARED_BY_TEKNOKRAFT = "Prepared by Winsalot Corp. for Teknokraft Canada Inc.";

/** Branding line for a brief; Hidebrandt (and any unknown/legacy key) keeps the original. */
export function briefPreparedBy(template: string | null | undefined): string {
  return template === BRIEF_TEMPLATE_TEKNOKRAFT_GOOGLE ? BRIEF_PREPARED_BY_TEKNOKRAFT : BRIEF_PREPARED_BY;
}

export const GOOGLE_VISIBILITY_OBJECTIVES = [
  "Improve the business's visibility on Google so more potential customers can discover its services",
  "Improve Google Search and Google Maps rankings for the services customers search for",
  "Optimize the Google Business Profile (categories, services, photos, posts, hours and reviews)",
  "Strengthen local SEO for the business's city and surrounding service areas",
  "Increase organic website traffic from relevant local searches",
] as const;

export const GOOGLE_CUSTOMER_ACQUISITION_OBJECTIVES = [
  "Increase local customer inquiries (calls, directions and form submissions)",
  "Turn more of that visibility into service bookings",
  "Review the existing website for SEO, mobile and conversion improvements",
  "Identify wider digital marketing opportunities that support long-term growth",
] as const;

export const GOOGLE_COMBINED_SOLUTION_SUMMARY =
  "Customers choosing a local service business usually search on Google and Google Maps first. A well-optimized Google Business Profile, strong local SEO and a website that is easy to find and easy to act on work together: visibility brings the right local customers in, and a clear website turns their interest into calls and bookings. This brief does not assume or promise pricing, rankings, traffic or lead volumes; scope and priorities are confirmed during the consultation.";

export const GOOGLE_EXPECTED_OUTCOMES = [
  "Confirm how customers currently find the business on Google and Google Maps",
  "Agree the priorities: rankings, Google Business Profile, local SEO and website improvements",
  "Agree the next step, timeline and any information needed from the prospect",
] as const;

export const GOOGLE_RECOMMENDED_NEXT_STEPS = [
  "Summarize what was discussed and confirm the priorities with the prospect",
  "Review the current Google Business Profile, local search presence and website",
  "Prepare a Google visibility and local SEO proposal once scope is confirmed",
  "Schedule a follow-up consultation to review the proposal",
] as const;

export function buildTeknokraftGoogleTemplate(input: {
  businessName: string;
  contactName: string | null;
  industry?: string | null;
  serviceArea?: string | null;
}): BriefTemplateFields {
  const who = input.contactName?.trim() || "the owner";
  const industry = input.industry?.trim().toLowerCase() || null;
  const area = input.serviceArea?.trim() || null;
  const services = industry ? `${industry} services` : "services";
  const where = area ? ` in ${area}` : " in their local area";
  return {
    why_interested: `${who} is interested in improving ${input.businessName}'s visibility on Google so that more potential customers can discover its ${services}${where}.`,
    primary_opportunity: "Google visibility + local SEO",
    main_interest: "Google Search / Google Maps / Google Business Profile / Local SEO",
    primary_need: `Be found by more local customers on Google and turn that visibility into inquiries and ${industry ? `${industry} ` : ""}service bookings`,
    interest_level: "High",
    recommended_objective: "Understand current Google visibility and secure a Google visibility + local SEO proposal opportunity",
    // The Prepare Appointment form keeps at most 5 talking points and 6
    // questions (MAX_TALKING_POINTS / MAX_SUGGESTED_QUESTIONS) - stay inside.
    talking_points: [
      "Improving visibility and rankings on Google Search and Google Maps",
      "Google Business Profile optimization: categories, services, photos, posts and reviews",
      `Local SEO targeting${area ? ` ${area}` : " the local service area"} to increase organic website traffic`,
      "Generating more customer inquiries and service bookings",
      "Reviewing the existing website and developing a long-term digital marketing strategy",
    ].join("\n"),
    suggested_questions: [
      "How do customers find you today, and how many inquiries come from Google?",
      "Do you have a Google Business Profile, and how are your reviews managed?",
      "Which services and areas do you most want to be found for?",
      "What do you like and dislike about your current website?",
      "What would more online inquiries and bookings mean for the business?",
      "What timeline and priorities do you have for improving online visibility?",
    ].join("\n"),
    recommended_next_step: "Send Proposal",
    next_step_note: "Confirm priorities and timeline, then send a Google visibility and local SEO proposal.",
  };
}
