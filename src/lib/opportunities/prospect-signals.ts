// Upgrades a Qualified Prospect from the default 'Prospect' intent level
// to 'Warm' when the connector has some text evidence of a buying signal
// (a new/relocated location, or a hiring pattern suggesting they need
// more cleaning coverage) - never 'Hot', since Hot requires a *confirmed*
// cleaning request, which would make it an Active Opportunity instead.
// Directory-only sources (e.g. an OSM business listing with no
// description text) will never trigger this and stay 'Prospect' by
// default - that's expected, not a bug.
const BUYING_SIGNAL_PHRASES = [
  "grand opening",
  "new location",
  "now open",
  "opening soon",
  "newly opened",
  "relocat",
  "moving to a new",
  "expansion",
  "now hiring",
  "hiring multiple",
];

export function hasBuyingSignal(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BUYING_SIGNAL_PHRASES.some((phrase) => lower.includes(phrase));
}
