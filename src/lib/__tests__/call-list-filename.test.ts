import { describe, expect, it } from "vitest";
import { suggestSegmentNameFromFilename } from "../call-list-filename";

describe("suggestSegmentNameFromFilename", () => {
  it("matches the LeadSwift example exactly", () => {
    const name = suggestSegmentNameFromFilename("campaign-124996-search-920856-website-designer_winnipeg-mb-canada_e488c1.csv");
    expect(name).toBe("Website Designer – Winnipeg MB");
  });

  it("strips the extension and a trailing hash for an XLSX export", () => {
    const name = suggestSegmentNameFromFilename("campaign-55001-search-88221-hvac-contractors_calgary-ab-canada_9f3d02.xlsx");
    expect(name).toBe("Hvac Contractors – Calgary AB");
  });

  it("falls back to a plain hyphenated filename with no LeadSwift boilerplate", () => {
    expect(suggestSegmentNameFromFilename("toronto-roofers-q3-export.csv")).toBe("Toronto Roofers Q3");
  });

  it("returns an empty string when nothing meaningful survives cleaning, leaving the field blank", () => {
    expect(suggestSegmentNameFromFilename("export_123456.csv")).toBe("");
  });

  it("does not mistake a real word for a hash just because it's short", () => {
    // "mb" (2 chars) and "ab" (2 chars) must survive as province codes,
    // not be treated as hash-like noise.
    const name = suggestSegmentNameFromFilename("plumbers_edmonton-ab.csv");
    expect(name).toBe("Plumbers – Edmonton AB");
  });
});
