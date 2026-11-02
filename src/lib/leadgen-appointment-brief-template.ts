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
  "Modern, professional design that reflects the quality of the company's construction work",
  "Mobile-friendly layout that works on phones, tablets and desktops",
  "Clear navigation so visitors find services, projects and contact details quickly",
  "Clear descriptions of each construction service offered",
  "Contact forms and quotation request forms that turn visits into inquiries",
] as const;

export const HSO_OBJECTIVES = [
  "Help the business attract relevant potential customers",
  "Improve online discovery by people searching for construction services",
  "Generate more qualified inquiries, not just more traffic",
  "Align website content with what real customers search for and need",
] as const;

export const COMBINED_SOLUTION_SUMMARY =
  "An integrated website improvement and lead-generation solution: the redesigned website gives visitors a clear, trustworthy place to learn about services and request a quote, and Human Search Optimization brings relevant potential customers to it. Together they turn online discovery into qualified inquiries.";

export const EXPECTED_OUTCOMES = [
  "Agree on the website redesign scope and priority pages",
  "Confirm how Human Search Optimization fits the business's target customers and service area",
  "Agree on next steps: proposal or quote, timeline and any information needed from the prospect",
] as const;

export function buildWebsiteHsoTemplate(input: { businessName: string; contactName: string | null }): BriefTemplateFields {
  const who = input.contactName?.trim() || "the owner";
  return {
    why_interested: `${who} is interested in a modern, mobile-friendly website with clear service descriptions and quotation requests, together with Human Search Optimization to attract relevant customers and generate more qualified inquiries.`,
    primary_opportunity: "Website redesign + Human Search Optimization",
    main_interest: "Website Redesign / Human Search Optimization (HSO)",
    primary_need: "Generate more qualified inquiries through a better website and improved online discovery",
    interest_level: "High",
    recommended_objective: "Understand project scope and secure a proposal opportunity",
    talking_points: [...WEBSITE_REDESIGN_OBJECTIVES.slice(0, 3), HSO_OBJECTIVES[0], COMBINED_SOLUTION_SUMMARY.split(":")[0]].join("\n"),
    suggested_questions: [
      `What do you like and dislike about ${input.businessName}'s current website?`,
      "Which construction services bring you the most profitable work?",
      "What types of customers and project sizes do you most want to attract?",
      "Which areas or cities do you serve?",
      "How do customers currently find you, and how many inquiries do you receive each month?",
      "What is your preferred timeline and budget range for the project?",
    ].join("\n"),
    recommended_next_step: "Send Proposal",
    next_step_note: "Confirm scope, timeline and budget, then send a combined website redesign + HSO proposal.",
  };
}
