import { describe, expect, it } from "vitest";
import {
  computeTrainingProgressSummary,
  findNextIncompleteModule,
  isModuleCompletedForUser,
  isModuleOpenedForUser,
  parseTrainingListField,
  trainingListFieldToTextarea,
} from "../crm-training-types";

describe("isModuleCompletedForUser", () => {
  it("is false when there is no progress row at all", () => {
    expect(isModuleCompletedForUser({ current_version: 1 }, undefined)).toBe(false);
  });

  it("is true when the progress row's version matches the module's current version and completed_at is set", () => {
    expect(isModuleCompletedForUser({ current_version: 1 }, { module_version: 1, completed_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("is false when the progress row exists but completed_at is null (opened, not completed)", () => {
    expect(isModuleCompletedForUser({ current_version: 1 }, { module_version: 1, completed_at: null })).toBe(false);
  });

  // "Require users to complete the revised version again" after a major
  // revision - a completion recorded against an older version never
  // counts as complete for the current one.
  it("is false when the progress row is for an older version than the module's current version", () => {
    expect(isModuleCompletedForUser({ current_version: 2 }, { module_version: 1, completed_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("isModuleOpenedForUser", () => {
  it("is false with no progress row", () => {
    expect(isModuleOpenedForUser({ current_version: 1 }, undefined)).toBe(false);
  });

  it("is true when a progress row for the current version has an opened_at", () => {
    expect(isModuleOpenedForUser({ current_version: 1 }, { module_version: 1, opened_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("is false when the progress row is for a stale (older) version", () => {
    expect(isModuleOpenedForUser({ current_version: 2 }, { module_version: 1, opened_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("computeTrainingProgressSummary", () => {
  const requiredA = { id: "a", current_version: 1, is_required: true };
  const requiredB = { id: "b", current_version: 1, is_required: true };
  const optionalC = { id: "c", current_version: 1, is_required: false };

  it("is 100% when there are no required modules at all", () => {
    const summary = computeTrainingProgressSummary([optionalC], new Map());
    expect(summary.percentComplete).toBe(100);
    expect(summary.totalRequired).toBe(0);
  });

  it("computes percentage from required modules only", () => {
    const progress = new Map([["a", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }]]);
    const summary = computeTrainingProgressSummary([requiredA, requiredB], progress);
    expect(summary.completedRequired).toBe(1);
    expect(summary.totalRequired).toBe(2);
    expect(summary.percentComplete).toBe(50);
  });

  // "Optional modules should not prevent 100% required completion."
  it("reaches 100% once every required module is complete, regardless of optional modules", () => {
    const progress = new Map([
      ["a", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }],
      ["b", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }],
    ]);
    const summary = computeTrainingProgressSummary([requiredA, requiredB, optionalC], progress);
    expect(summary.percentComplete).toBe(100);
    expect(summary.completedOptional).toBe(0);
    expect(summary.totalOptional).toBe(1);
  });

  it("does not count a stale (outdated-version) completion", () => {
    const staleModule = { id: "a", current_version: 2, is_required: true };
    const progress = new Map([["a", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }]]);
    const summary = computeTrainingProgressSummary([staleModule], progress);
    expect(summary.completedRequired).toBe(0);
    expect(summary.percentComplete).toBe(0);
  });
});

describe("findNextIncompleteModule", () => {
  const a = { id: "a", current_version: 1, is_required: true, sort_order: 1 };
  const b = { id: "b", current_version: 1, is_required: true, sort_order: 2 };
  const optionalFirst = { id: "opt", current_version: 1, is_required: false, sort_order: 0 };

  it("returns null once everything is complete", () => {
    const progress = new Map([
      ["a", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }],
      ["b", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }],
    ]);
    expect(findNextIncompleteModule([a, b], progress)).toBeNull();
  });

  it("returns the first incomplete module in sort order", () => {
    expect(findNextIncompleteModule([b, a], new Map())).toEqual(a);
  });

  it("prefers a required module over an earlier-sorted optional one", () => {
    const progress = new Map([["a", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }]]);
    expect(findNextIncompleteModule([optionalFirst, a, b], progress)).toEqual(b);
  });

  it("falls back to an incomplete optional module once all required ones are done", () => {
    const progress = new Map([
      ["a", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }],
      ["b", { module_version: 1, completed_at: "2026-01-01T00:00:00Z" }],
    ]);
    expect(findNextIncompleteModule([optionalFirst, a, b], progress)).toEqual(optionalFirst);
  });
});

describe("parseTrainingListField / trainingListFieldToTextarea", () => {
  it("splits on newlines and drops blank lines", () => {
    expect(parseTrainingListField("Line one\n\nLine two\n   \nLine three")).toEqual(["Line one", "Line two", "Line three"]);
  });

  it("trims whitespace from each line", () => {
    expect(parseTrainingListField("  padded  \nsecond")).toEqual(["padded", "second"]);
  });

  it("is empty for blank input", () => {
    expect(parseTrainingListField("")).toEqual([]);
    expect(parseTrainingListField("   \n  ")).toEqual([]);
  });

  it("round-trips through trainingListFieldToTextarea", () => {
    const items = ["First item", "Second item", "Third item"];
    expect(parseTrainingListField(trainingListFieldToTextarea(items))).toEqual(items);
  });
});
