import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toGrowthScriptPayload } from "../growth-script-sessions";
import type { GrowthScriptSessionPayload } from "../growth-script-session-types";
import ApprovedScriptPanel from "@/components/growth-script-dock/ApprovedScriptPanel";
import GrowthScriptDockProvider from "@/components/growth-script-dock/GrowthScriptDockProvider";
import GrowthAgentScriptStatusCard from "@/components/growth-script-dock/GrowthAgentScriptStatusCard";
import { GrowthScriptReminderView } from "@/components/growth-script-dock/GrowthScriptDockWidgets";

const segment = (over: Record<string, unknown> = {}) => ({
  id: "seg-1",
  name: "Website Designer – Oshawa ON",
  campaign_name: "Winsalot Corp — Website Designer – Oshawa ON",
  growth_opportunity_type: "lead_generation",
  call_script_key: "website-development",
  call_script_text: null,
  ...over,
});

describe("Growth script payload", () => {
  it("resolves the service template for a website list, without any client owner", () => {
    const p = toGrowthScriptPayload(segment())!;
    expect(p.serviceKey).toBe("website-development");
    expect(p.serviceLabel).toBe("Website Development / Web Design");
    expect(Object.keys(p)).not.toContain("clientName");
    expect(Object.keys(p)).not.toContain("clientId");
  });
  it("uses Admin custom text when set and skips lists with no script at all", () => {
    expect(toGrowthScriptPayload(segment({ call_script_text: "Hi [Agent Name]" }))!.scriptText).toBe("Hi [Agent Name]");
    expect(toGrowthScriptPayload(segment({ call_script_key: null, growth_opportunity_type: "lead_generation" }))).toBeNull();
    expect(toGrowthScriptPayload(segment({ call_script_key: null, growth_opportunity_type: "business_financing" }))!.serviceKey).toBe("business-finance");
  });
});

const payload = toGrowthScriptPayload(segment())!;
const custom: GrowthScriptSessionPayload = { ...payload, scriptText: "Hello, this is [Agent Name] from Winsalot Corp." };

describe("Growth script panel, reminder and admin card", () => {
  it("inserts the logged-in agent's name automatically", () => {
    expect(renderToStaticMarkup(createElement(ApprovedScriptPanel, { payload: custom, agentName: "Goodness Ugbana" }))).toContain("this is Goodness Ugbana from Winsalot Corp.");
    expect(renderToStaticMarkup(createElement(ApprovedScriptPanel, { payload, agentName: "Henry Osuji" }))).toContain("Henry Osuji");
  });
  it("reminds with an amber Open Script notice (never red) and clears once open", () => {
    const closed = renderToStaticMarkup(createElement(GrowthScriptReminderView, { open: false, sessions: [payload], onOpen: () => undefined }));
    expect(closed).toContain("Open your approved campaign script before calling and keep it open while working this list.");
    expect(closed).toContain("Open Script");
    expect(closed).not.toMatch(/rose|red-/);
    const open = renderToStaticMarkup(createElement(GrowthScriptReminderView, { open: true, sessions: [payload], onOpen: () => undefined }));
    expect(open).not.toContain("Open Script");
  });
  it("one reminder button per service, not per list", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...payload, segmentId: `s${i}`, segmentName: `List ${i}` }));
    expect(renderToStaticMarkup(createElement(GrowthScriptReminderView, { open: false, sessions: many, onOpen: () => undefined })).match(/Open Script/g)?.length).toBe(1);
  });
  it("admin card: one compact row per agent, Growth owner stays Winsalot Corp, never red", () => {
    const b = { ...payload, segmentId: "seg-2", segmentName: "Website Designer – Barrie ON" };
    const rows = [
      { agentId: "a1", agentName: "Henry Osuji", payload, state: "open" as const, openedAt: null, lastActivityAt: new Date().toISOString() },
      { agentId: "a1", agentName: "Henry Osuji", payload: { ...payload, segmentId: "seg-3", segmentName: "Website Designer – North Bay ON" }, state: "closed" as const, openedAt: null, lastActivityAt: null },
      { agentId: "a2", agentName: "Goodness Ugbana", payload: b, state: "closed_working" as const, openedAt: null, lastActivityAt: null },
    ];
    const html = renderToStaticMarkup(createElement(GrowthScriptDockProvider, { agentName: "Admin" }, createElement(GrowthAgentScriptStatusCard, { rows, previewSessions: [] })));
    expect(html).toContain("Agent Script Status");
    expect(html.match(/Henry Osuji/g)?.length).toBe(1);
    expect(html).toContain("2 campaigns");
    expect(html).toContain("Current: Website Designer – Oshawa ON");
    expect(html).toMatch(/emerald[^"]*">\s*Script Open/);
    expect(html).toContain("Script Closed");
    expect(html).not.toContain("Preview Script");
    expect(html).not.toMatch(/rose|red-/);
  });
});

describe("Growth isolation", () => {
  const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  it("migration: RLS, admin-only select, no anon/authenticated writes, no destructive SQL", () => {
    const sql = read("../../../supabase/migrations/20260930120000_growth_agent_script_status.sql");
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select\s+using \(public\.crm_user_role\(auth\.uid\(\)\) = 'admin'\)/);
    expect(sql).toMatch(/revoke all on table public\.crm_agent_script_status from anon, authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i);
    expect(sql).not.toMatch(/\bdrop table\b|\bdelete from\b|\btruncate\b|\balter table public\.(?!crm_agent_script_status)/i);
    expect(sql.replace(/--.*$/gm, "")).not.toMatch(/leadgen_/);
  });
  it("Growth code never touches Lead Generation tables or client owners", () => {
    for (const f of ["../growth-script-sessions.ts", "../growth-script-notifications.ts", "../../app/agent/(dashboard)/growth-script-status-actions.ts"]) {
      const src = read(f);
      expect(src).not.toMatch(/leadgen_(clients|campaigns|notifications|users|agent_script)/);
      expect(src).not.toMatch(/crm_client_id/);
    }
    expect(read("../growth-script-notifications.ts")).toContain('from("crm_notifications")');
  });
});
