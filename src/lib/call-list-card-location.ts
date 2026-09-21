import type { CallListLeadRow } from "./call-list-types";

export type CallListCardLocationVisibility = {
  showStreetAddress: boolean;
  showCity: boolean;
  showProvince: boolean;
  showPostalCode: boolean;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

// Compact location text for the agent Call List card: at most two short
// lines, "Street Address" then "City, Province Postal Code" - built only
// from whichever fields are visible (per Admin's Manage Columns setting)
// and non-blank for this lead. Never renders a blank line or a literal
// "undefined"/"null"/"—" placeholder - a field with nothing to show is
// simply left out of the join.
//
// When street_address already contains the parsed city/province/postal
// code - a LeadSwift export that put everything into one combined
// `address` column keeps that original text verbatim in street_address
// rather than truncating it, see address-parser.ts - the second line is
// dropped instead of repeating the same location twice; the full original
// address is shown as the single line, matching "if the full structured
// location isn't available, fall back to the original address" without
// ever showing both at once.
export function locationLines(
  lead: Pick<CallListLeadRow, "street_address" | "city" | "province" | "postal_code">,
  visibility: CallListCardLocationVisibility
): string[] {
  const street = ((visibility.showStreetAddress ? lead.street_address : null) ?? "").trim();
  const city = ((visibility.showCity ? lead.city : null) ?? "").trim();
  const province = ((visibility.showProvince ? lead.province : null) ?? "").trim();
  const postalCode = ((visibility.showPostalCode ? lead.postal_code : null) ?? "").trim();

  const provincePostal = [province, postalCode].filter(Boolean).join(" ");
  const cityLine = [city, provincePostal].filter(Boolean).join(", ");

  if (!street && !cityLine) return [];
  if (!street) return [cityLine];
  if (!cityLine) return [street];
  if (normalize(street).includes(normalize(cityLine))) return [street];
  return [street, cityLine];
}
