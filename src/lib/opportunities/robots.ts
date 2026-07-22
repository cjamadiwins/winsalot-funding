import "server-only";

// Runtime robots.txt enforcement for every connector that fetches an HTML
// page directly (the CanadaBuys connector doesn't need this - it reads a
// published open-data CSV file, not a crawled page). Connectors call
// isAllowedByRobots() before every fetch; this is what makes "respect
// robots.txt" an enforced runtime check rather than something verified by
// hand once and hoped to stay true.
//
// Fails safe: if robots.txt can't be fetched or parsed for any reason
// other than a confirmed 404 (no robots.txt = allowed, the standard
// convention), the path is treated as disallowed for that run. A source
// being temporarily unreachable should mean "skip it this run", never
// "assume permission."

export const OPPORTUNITY_BOT_USER_AGENT = "WinsalotOpportunityBot/1.0 (+mailto:info@winsalotcorp.com)";

type RobotsRule = { type: "allow" | "disallow"; path: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour - connectors run at most once/day, this just avoids refetching within a run.
const robotsCache = new Map<string, { text: string | null; fetchedAt: number }>();

function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let groupHasRules = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (!current || groupHasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        groupHasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "disallow" || key === "allow") && current) {
      current.rules.push({ type: key, path: value });
      groupHasRules = true;
    }
  }

  return groups;
}

function selectRules(groups: RobotsGroup[], userAgentToken: string): RobotsRule[] {
  const token = userAgentToken.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => token.includes(a) || a.includes(token)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  return (specific ?? wildcard)?.rules ?? [];
}

// Longest-matching-path wins; an exact tie between an Allow and a Disallow
// favors Allow, per the de-facto robots.txt convention most crawlers use.
function isPathAllowed(path: string, rules: RobotsRule[]): boolean {
  let best: { type: "allow" | "disallow"; length: number } | null = null;
  for (const rule of rules) {
    if (rule.type === "disallow" && rule.path === "") continue; // empty Disallow means "allow everything"
    if (path.startsWith(rule.path) && (!best || rule.path.length >= best.length)) {
      best = { type: rule.type, length: rule.path.length };
    }
  }
  if (!best) return true;
  return best.type === "allow";
}

async function fetchRobotsText(origin: string): Promise<string | null> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.text;
  }

  let text: string | null;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": OPPORTUNITY_BOT_USER_AGENT },
    });
    if (res.status === 404) {
      text = ""; // no robots.txt published = everything allowed
    } else if (!res.ok) {
      text = null; // couldn't confirm permission - fail safe
    } else {
      text = await res.text();
    }
  } catch {
    text = null;
  }

  robotsCache.set(origin, { text, fetchedAt: Date.now() });
  return text;
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const robotsText = await fetchRobotsText(parsed.origin);
  if (robotsText === null) return false;
  if (robotsText === "") return true;

  const groups = parseRobotsGroups(robotsText);
  const rules = selectRules(groups, OPPORTUNITY_BOT_USER_AGENT);
  return isPathAllowed(parsed.pathname, rules);
}
