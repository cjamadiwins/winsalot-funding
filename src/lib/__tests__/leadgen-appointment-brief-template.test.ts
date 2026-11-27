import { describe, expect, it } from "vitest";
import { BRIEF_PREPARED_BY, BRIEF_TEMPLATE_WEBSITE_HSO, buildWebsiteHsoTemplate } from "@/lib/leadgen-appointment-brief-template";
import { MAX_SUGGESTED_QUESTIONS, MAX_TALKING_POINTS, isBriefContentComplete, parseLineList } from "@/lib/leadgen-appointment-prep";

describe("Website Redesign + HSO brief template", () => {
  const t = buildWebsiteHsoTemplate({ businessName: "Hiveforge Construction Ltd", contactName: "Hassan" });

  it("produces a send-ready brief within field limits", () => {
    const talking = parseLineList(t.talking_points, 50);
    const questions = parseLineList(t.suggested_questions, 50);
    expect(talking.length).toBeLessThanOrEqual(MAX_TALKING_POINTS);
    expect(questions.length).toBeLessThanOrEqual(MAX_SUGGESTED_QUESTIONS);
    expect(isBriefContentComplete({ why_interested: t.why_interested, primary_opportunity: t.primary_opportunity, talking_points: talking, suggested_questions: questions })).toBe(true);
  });

  it("covers both services and names the contact", () => {
    expect(t.main_interest).toMatch(/Website Redesign/);
    expect(t.main_interest).toMatch(/HSO/);
    expect(t.why_interested).toContain("Hassan");
  });

  it("exports the branding line and template key", () => {
    expect(BRIEF_PREPARED_BY).toBe("Prepared by Winsalot Corp. for Hidebrandt Web Services");
    expect(BRIEF_TEMPLATE_WEBSITE_HSO).toBe("website_redesign_hso");
  });
});
