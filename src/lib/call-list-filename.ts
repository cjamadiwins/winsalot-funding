// Suggests a human-readable Call List Segment name from an uploaded
// file's own name - LeadSwift (and similar scraper/export tools) name
// their exports with internal campaign ids, an export-type keyword, and
// a trailing hash, e.g.:
//   campaign-124996-search-920856-website-designer_winnipeg-mb-canada_e488c1.csv
// which this turns into "Website Designer – Winnipeg MB". Deliberately no
// "server-only" import - this runs client-side, the moment a file is
// selected, before any upload happens.
//
// Never authoritative: the Segment Name field is always left fully
// editable, and this is only ever used to pre-fill it while it's still
// blank (or still holds a previous auto-suggestion) - see
// UploadSegmentClient's hasEditedName tracking.

// LeadSwift's own export-type/boilerplate keywords, plus the country
// LeadSwift always appends after city/province (redundant once a
// province is already shown).
const STOPWORDS = new Set(["campaign", "search", "export", "leadswift", "leads", "list", "data", "canada", "usa", "us", "united", "states"]);

function isPureNumeric(token: string): boolean {
  return /^[0-9]+$/.test(token);
}

// A LeadSwift trailing id (e.g. "e488c1") looks like a short run of hex
// characters that includes at least one digit - an ordinary English word
// made up only of a-f letters (rare, but e.g. "beaded") never has a digit
// mixed in, so requiring one keeps this from misfiring on real words.
function isHashLike(token: string): boolean {
  return token.length >= 5 && /^[0-9a-f]+$/i.test(token) && /[0-9]/.test(token);
}

function formatWord(word: string): string {
  // Most 2-letter tokens surviving this far are a province/state code
  // (MB, ON, NY, CA...) - upper-casing those reads far better than
  // title-casing them ("Mb").
  if (word.length <= 2) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function suggestSegmentNameFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const groups = withoutExt.split("_");

  const cleanedGroups: string[] = [];
  for (const group of groups) {
    const words = group
      .split("-")
      .map((word) => word.trim())
      .filter(Boolean)
      .filter((word) => !STOPWORDS.has(word.toLowerCase()))
      .filter((word) => !isPureNumeric(word))
      .filter((word) => !isHashLike(word));
    if (words.length > 0) {
      cleanedGroups.push(words.map(formatWord).join(" "));
    }
  }

  return cleanedGroups.join(" – ");
}
