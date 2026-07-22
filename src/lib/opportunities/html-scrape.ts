import "server-only";

// Lightweight, dependency-free HTML helpers for the public tender-listing
// connectors. Deliberately not a full HTML parser - just enough to pull
// plain text and links out of a <tr> row, which is how most public bid
// listing pages lay out one opportunity per row.

const TAG_REGEX = /<[^>]+>/g;
const WHITESPACE_REGEX = /\s+/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(TAG_REGEX, " ")).replace(WHITESPACE_REGEX, " ").trim();
}

export type ScrapedRow = {
  text: string;
  links: { href: string; text: string }[];
};

export function extractTableRows(html: string): ScrapedRow[] {
  const rowMatches = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  return rowMatches.map((rowHtml) => {
    const links: { href: string; text: string }[] = [];
    const anchorRegex = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(rowHtml))) {
      links.push({ href: match[1], text: stripTags(match[2]) });
    }
    return { text: stripTags(rowHtml), links };
  });
}

export function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const DATE_REGEX = /(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})|([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})/;

export function extractDate(text: string): string | undefined {
  const match = text.match(DATE_REGEX);
  if (!match) return undefined;
  const parsed = new Date(match[0]);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}
