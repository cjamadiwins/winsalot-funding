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
