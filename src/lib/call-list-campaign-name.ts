export function buildCallListCampaignName(input: {
  clientName: string;
  industry: string | null;
  location: string | null;
}): string {
  return [input.clientName, input.industry, input.location]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" — ");
}

// Website Design & SEO clients (Hidebrandt Web Services, Teknokraft Canada Inc.)
// share ONE umbrella service label. The lead niche (industry) and market
// (location) stay separate, trailing the label - they are never service
// categories of their own (no "Website Design", "Website Needs Rebrand", "SEO Leads").
export const WEBSITE_SEO_SERVICE_LABEL = "Lead Generation for Website & SEO";

const WEBSITE_SEO_CLIENTS = new Set(["hidebrandt web services", "teknokraft canada inc."]);

export function isWebsiteSeoClient(clientName: string | null | undefined): boolean {
  return WEBSITE_SEO_CLIENTS.has((clientName ?? "").trim().toLowerCase());
}

// Lead Generation CRM list campaign label: for the Website & SEO clients it is
// exactly the umbrella service label - the list's own name carries the niche,
// market and any genuine qualifier (e.g. "Pet Sitter — Ottawa — No Website"), so
// Client -> Lead Generation for Website & SEO -> niche list -> leads. Any other
// client keeps the original "Client — industry — location". Display text only;
// Growth CRM keeps buildCallListCampaignName.
export function buildLeadgenListCampaignName(input: { clientName: string; industry: string | null; location: string | null }): string {
  if (!isWebsiteSeoClient(input.clientName)) return buildCallListCampaignName(input);
  return WEBSITE_SEO_SERVICE_LABEL;
}
