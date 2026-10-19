// A missing export value is not evidence that a business has no website.
export type WebsiteOpportunity =
  | "rebranding"
  | "new_website"
  | "verification_needed";
export const WEBSITE_OPPORTUNITY_LABELS: Record<WebsiteOpportunity, string> = {
  rebranding: "Website rebranding opportunities",
  new_website: "New website opportunities",
  verification_needed: "Website verification needed",
};
export function websiteOpportunity(
  website: string | null | undefined,
  verifiedStatus?: string | null,
): WebsiteOpportunity {
  const value = website?.trim();
  if (value) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(value) ? value : `https://${value}`,
      );
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const directories = [
        "facebook.com",
        "instagram.com",
        "linkedin.com",
        "yellowpages.ca",
        "yelp.ca",
        "yelp.com",
        "google.com",
        "maps.google.com",
        "goo.gl",
        "linktr.ee",
      ];
      if (
        ["http:", "https:"].includes(url.protocol) &&
        host.includes(".") &&
        !url.username &&
        !url.password &&
        !directories.some((d) => host === d || host.endsWith(`.${d}`))
      )
        return "rebranding";
    } catch {
      /* Retain uncertain source values for review. */
    }
    return "verification_needed";
  }
  return verifiedStatus === "verified_no_website"
    ? "new_website"
    : "verification_needed";
}
