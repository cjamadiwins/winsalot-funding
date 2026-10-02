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

// Lead Generation CRM list label: standardized service label + niche + market for
// the Website & SEO clients, the original "Client — industry — location" for any
// other client. Display text only; Growth CRM keeps buildCallListCampaignName.
export function buildLeadgenListCampaignName(input: { clientName: string; industry: string | null; location: string | null }): string {
  if (!isWebsiteSeoClient(input.clientName)) return buildCallListCampaignName(input);
  return buildCallListCampaignName({ clientName: WEBSITE_SEO_SERVICE_LABEL, industry: input.industry, location: input.location });
}
