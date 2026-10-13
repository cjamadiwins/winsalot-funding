import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Guard: every code path that INSERTs into leadgen_leads is listed here, with
// how it makes sure the new lead has a campaign. A new path fails this test
// until it is added on purpose (and given the same treatment).
//
// The booking page, Calendly webhook, Opportunity Finder and client portal are
// NOT lead-creation paths: the first two create appointments (campaign decided
// by leadgen-booking-campaign.ts), the other two only act on existing leads.

const ALLOWED: Record<string, string> = {
  "src/app/leadgen/agent/(dashboard)/leads/new/actions.ts": "resolveNewLeadCampaign",
  "src/app/leadgen/admin/(dashboard)/leads/actions.ts": "resolveNewLeadCampaign",
  "src/lib/call-list-promote.ts": "leadgen_campaign_id",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("lead creation paths", () => {
  const inserting = sourceFiles("src").filter((file) => /from\(\s*"leadgen_leads"\s*\)\s*\.(insert|upsert)\(/.test(readFileSync(file, "utf8")));

  it("are exactly the known ones", () => {
    expect(inserting.map((f) => f.split(path.sep).join("/")).sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it("each one enforces a campaign", () => {
    for (const file of inserting) {
      expect(readFileSync(file, "utf8"), file).toContain(ALLOWED[file.split(path.sep).join("/")]);
    }
  });

  it("the automated integrations never insert leads", () => {
    for (const file of ["src/app/book/[slug]/actions.ts", "src/app/api/webhooks/calendly/route.ts", "src/lib/opportunity-finder.ts", "src/app/client/(portal)/actions.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from\(\s*"leadgen_leads"\s*\)\s*\.(insert|upsert)\(/);
    }
  });
});
