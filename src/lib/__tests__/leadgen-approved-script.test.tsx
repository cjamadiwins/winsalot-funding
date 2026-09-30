import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WEBSITE_SERVICES_OPENING_TEMPLATE,
  agentFirstName,
  buildWebsiteServicesScript,
  isWebsiteServicesCampaign,
  renderWebsiteServicesOpening,
} from "../leadgen-website-script";
import { buildLeadgenCallScript } from "../leadgen-call-script";
import type { ScriptSessionPayload } from "../leadgen-script-session-types";
import ApprovedScriptPanel from "@/components/leadgen/script-dock/ApprovedScriptPanel";
import ScriptDockProvider from "@/components/leadgen/script-dock/ScriptDockProvider";
import AgentScriptStatusCard from "@/components/leadgen/script-dock/AgentScriptStatusCard";
import { ScriptReminderView } from "@/components/leadgen/script-dock/ScriptDockWidgets";

const baseClient = {
  call_script_value_proposition: null,
  call_script_services: "website design and development, website redesign, and SEO or online visibility",
  call_script_closing: null,
  call_script_notes: null,
  call_script_override: null,
};
const payload = (clientName: string, segmentName: string): ScriptSessionPayload => ({
  segmentId: `seg-${clientName}`,
  segmentName,
  clientId: `client-${clientName}`,
  clientName,
  campaignId: `camp-${clientName}`,
  campaignName: `${clientName} Campaign`,
  industry: "Snow Removal",
  websiteServices: true,
  client: { name: clientName, ...baseClient },
});
const teknokraft = payload("Teknokraft Canada Inc.", "Toronto Snow Removal");
const hidebrandt = payload("Hidebrandt Web Services", "Winnipeg Snow Removal");

describe("standard approved website-services opening", () => {
  it("uses the exact approved wording with the agent's first name and the list's client", () => {
    expect(renderWebsiteServicesOpening("Henry Osuji", "Teknokraft Canada Inc.")).toBe(
      "Hi, my name is Henry from Winsalot Corp., calling on behalf of Teknokraft Canada Inc.. I came across your website and wanted to reach out because we help businesses generate more leads and rebrand their websites so they better showcase their work. Would you be open to a quick conversation about that?"
    );
    expect(renderWebsiteServicesOpening("Goodness Ugbana", "Hidebrandt Web Services")).toMatch(
      /^Hi, my name is Goodness from Winsalot Corp\., calling on behalf of Hidebrandt Web Services\./
    );
  });

  it("never claims the business has no website, and has no lead-status input so it is identical for every category", () => {
    expect(WEBSITE_SERVICES_OPENING_TEMPLATE).not.toMatch(/(do(es)? ?n[o']t|no) (have|see|found).*website|without a website|no website/i);
    // Same inputs -> same opening whatever the lead was categorized as.
    const a = buildWebsiteServicesScript({ agentName: "Henry Osuji", clientName: "Teknokraft Canada Inc." }).opening;
    const b = buildWebsiteServicesScript({ agentName: "Henry Osuji", clientName: "Teknokraft Canada Inc.", industry: "Painters" }).opening;
    expect(a).toBe(b);
  });

  it("does not hard-code client names in the shared script builder", () => {
    const src = readFileSync(path.resolve(__dirname, "../leadgen-website-script.ts"), "utf8");
    const builder = src.slice(src.indexOf("export function renderWebsiteServicesOpening"));
    expect(builder).not.toMatch(/Teknokraft|Hidebrandt|Henry|Goodness/);
  });

  it("keeps a placeholder when no agent is in context", () => {
    expect(agentFirstName("[Agent Name]")).toBe("[Agent Name]");
    expect(agentFirstName("goodness@winsalotcorp.com")).toBe("goodness");
  });

  it("includes every required script section", () => {
    const script = buildWebsiteServicesScript({ agentName: "Henry Osuji", clientName: "Teknokraft Canada Inc.", industry: "Snow Removal", campaignLabel: "Toronto" });
    expect(script.qualificationQuestions.length).toBeGreaterThan(0);
    expect(script.talkingPoints.length).toBeGreaterThan(0);
    expect(script.objections.length).toBeGreaterThan(0);
    expect(script.cta.line).toContain("Teknokraft Canada Inc.");
    expect(script.industry).toBe("Snow Removal");
  });

  it("buildLeadgenCallScript uses the standard opening for website campaigns but still admin-overridable as additional text", () => {
    const client = { name: "Hidebrandt Web Services", ...baseClient, call_script_override: "Extra: mention Winnipeg." };
    const script = buildLeadgenCallScript({ agentName: "Goodness Ugbana", client });
    expect(script.opening?.[0]).toContain("Hi, my name is Goodness from Winsalot Corp., calling on behalf of Hidebrandt Web Services.");
    expect(script.adminScript).toBe("Extra: mention Winnipeg.");
    expect(script.isCustomOverride).toBe(false);
  });

  it("leaves non-website campaigns on the existing script", () => {
    const client = { name: "Some Cleaning Co", ...baseClient, call_script_services: "commercial cleaning" };
    const script = buildLeadgenCallScript({ agentName: "Henry Osuji", client });
    expect(script.opening?.[1]).toContain("Henry Osuji");
    expect(isWebsiteServicesCampaign({ clientName: "Some Cleaning Co", services: "commercial cleaning" })).toBe(false);
  });
});

describe("approved script panel rendering", () => {
  it("shows the correct agent and client automatically", () => {
    const henry = renderToStaticMarkup(createElement(ApprovedScriptPanel, { payload: teknokraft, agentName: "Henry Osuji" }));
    expect(henry).toContain("Hi, my name is Henry from Winsalot Corp., calling on behalf of Teknokraft Canada Inc.");
    expect(henry).not.toContain("Hidebrandt");
    const goodness = renderToStaticMarkup(createElement(ApprovedScriptPanel, { payload: hidebrandt, agentName: "Goodness Ugbana" }));
    expect(goodness).toContain("Hi, my name is Goodness from Winsalot Corp., calling on behalf of Hidebrandt Web Services");
    expect(goodness).not.toContain("Teknokraft");
    for (const section of ["Opening", "Qualification questions", "Key talking points", "Objection handling", "Appointment / CTA"]) {
      expect(goodness).toContain(section);
    }
  });
});

describe("dashboard reminder and admin status card", () => {
  it("reminds the agent with an amber Open Script notice (not red) when the script is closed", () => {
    const html = renderToStaticMarkup(createElement(ScriptReminderView, { open: false, sessions: [teknokraft], onOpen: () => undefined }));
    expect(html).toContain("Approved Call Script");
    expect(html).toContain("Open your approved campaign script before calling and keep it open while working this list.");
    expect(html).toContain("Open Script");
    expect(html).toContain("amber");
    expect(html).not.toMatch(/rose|red-/);
  });

  it("shows one button per client, not per list", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...hidebrandt, segmentId: `seg-h-${i}`, segmentName: `List ${i}` }));
    const html = renderToStaticMarkup(createElement(ScriptReminderView, { open: false, sessions: [...many, teknokraft], onOpen: () => undefined }));
    expect(html.match(/Open Script/g)?.length).toBe(2);
  });

  it("clears the reminder once the script is open, and shows nothing without an active list", () => {
    const open = renderToStaticMarkup(createElement(ScriptReminderView, { open: true, sessions: [teknokraft], onOpen: () => undefined }));
    expect(open).not.toContain("Open Script");
    expect(open).toContain("is open");
    expect(renderToStaticMarkup(createElement(ScriptReminderView, { open: false, sessions: [], onOpen: () => undefined }))).toBe("");
  });

  it("admin card: one compact row per agent, green open, amber/gray otherwise, never red", () => {
    const other = { ...hidebrandt, segmentId: "seg-h2", campaignId: "camp-h2", campaignName: "Hidebrandt Web Services — Brandon Pet Groomer" };
    const rows = [
      { agentId: "a1", agentName: "Henry Osuji", payload: teknokraft, state: "open" as const, openedAt: null, lastActivityAt: new Date().toISOString() },
      { agentId: "a1", agentName: "Henry Osuji", payload: hidebrandt, state: "closed" as const, openedAt: null, lastActivityAt: null },
      { agentId: "a2", agentName: "Goodness Ugbana", payload: hidebrandt, state: "closed_working" as const, openedAt: null, lastActivityAt: null },
      { agentId: "a2", agentName: "Goodness Ugbana", payload: other, state: "never_opened" as const, openedAt: null, lastActivityAt: null },
    ];
    const html = renderToStaticMarkup(createElement(ScriptDockProvider, { agentName: "Admin" }, createElement(AgentScriptStatusCard, { rows, previewSessions: [] })));
    expect(html).toContain("Agent Script Status");
    expect(html.match(/Henry Osuji/g)?.length).toBe(1);
    expect(html.match(/Goodness Ugbana/g)?.length).toBe(1);
    expect(html).toContain("2 campaigns");
    expect(html).toContain("Current: Teknokraft Canada Inc. Campaign");
    expect(html.match(/View Details/g)?.length).toBe(2);
    expect(html).toMatch(/emerald[^"]*">\s*Script Open/);
    expect(html).toContain("Script Closed");
    // campaign-level detail is not on the main dashboard
    expect(html).not.toContain("Preview Script");
    expect(html).not.toContain("Brandon Pet Groomer");
    expect(html).not.toMatch(/rose|red-/);
  });
});

describe("migration safety", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260930110000_leadgen_agent_script_status.sql"), "utf8");
  it("enables RLS, admin-only select, no anon/authenticated writes", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select\s+using \(public\.leadgen_user_role\(auth\.uid\(\)\) = 'admin'\)/);
    expect(sql).toMatch(/revoke all on table public\.leadgen_agent_script_status from anon, authenticated/);
    expect(sql).toMatch(/grant select on table public\.leadgen_agent_script_status to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i);
    expect(sql).not.toMatch(/\bdrop table\b|\bdelete from\b|\btruncate\b/i);
  });
});
