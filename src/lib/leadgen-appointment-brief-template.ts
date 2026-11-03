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
