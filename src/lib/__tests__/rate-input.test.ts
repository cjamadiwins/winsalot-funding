import { describe, expect, it } from "vitest";
import { sanitizeRateInputText, normalizeRateValue, formatRateForInput } from "../rate-input";

describe("sanitizeRateInputText", () => {
  it("strips leading zeros while typing", () => {
    expect(sanitizeRateInputText("0750")).toBe("750");
    expect(sanitizeRateInputText("00750")).toBe("750");
    expect(sanitizeRateInputText("750")).toBe("750");
  });

  it("preserves valid decimals", () => {
    expect(sanitizeRateInputText("750.50")).toBe("750.50");
    expect(sanitizeRateInputText("0.50")).toBe("0.50");
  });

  it("preserves a literal zero", () => {
    expect(sanitizeRateInputText("0")).toBe("0");
    expect(sanitizeRateInputText("00")).toBe("0");
  });

  it("never re-introduces a leading zero as more digits are typed", () => {
    // Simulates typing "7", then "5", then "0" one keystroke at a time.
    let text = "";
    for (const digit of ["7", "5", "0"]) {
      text = sanitizeRateInputText(text + digit);
    }
    expect(text).toBe("750");
  });

  it("collapses stray extra decimal points and non-numeric characters", () => {
    expect(sanitizeRateInputText("7..5")).toBe("7.5");
    expect(sanitizeRateInputText("$750")).toBe("750");
  });

  it("allows an in-progress trailing decimal point", () => {
    expect(sanitizeRateInputText("750.")).toBe("750.");
    expect(sanitizeRateInputText(".")).toBe("0.");
  });

  it("allows clearing the field", () => {
    expect(sanitizeRateInputText("")).toBe("");
  });
});

describe("normalizeRateValue", () => {
  it("normalizes leading-zero strings to clean numbers", () => {
    expect(normalizeRateValue("0750")).toBe(750);
    expect(normalizeRateValue("00750")).toBe(750);
    expect(normalizeRateValue("750")).toBe(750);
  });

  it("preserves valid decimals and small values", () => {
    expect(normalizeRateValue("750.50")).toBe(750.5);
    expect(normalizeRateValue("0.50")).toBe(0.5);
    expect(normalizeRateValue(0)).toBe(0);
  });

  it("rounds to cents and rejects negative or invalid values", () => {
    expect(normalizeRateValue(750.567)).toBe(750.57);
    expect(normalizeRateValue(-50)).toBe(0);
    expect(normalizeRateValue(Number.NaN)).toBe(0);
    expect(normalizeRateValue(null)).toBe(0);
    expect(normalizeRateValue(undefined)).toBe(0);
  });
});

describe("formatRateForInput", () => {
  it("never produces a leading zero", () => {
    expect(formatRateForInput(750)).toBe("750");
    expect(formatRateForInput(0.5)).toBe("0.5");
    expect(formatRateForInput(0)).toBe("0");
  });
});
