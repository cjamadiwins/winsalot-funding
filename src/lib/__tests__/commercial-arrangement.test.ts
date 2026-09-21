import { describe, expect, it } from "vitest";
import { formatArrangementBanner } from "../commercial-arrangement";

describe("formatArrangementBanner", () => {
  it("returns null for a Standard Monthly arrangement", () => {
    expect(
      formatArrangementBanner({ arrangement_type: "standard_monthly", arrangement_standard_fee: 750, arrangement_upfront_payment: 0, arrangement_attribution_period: null })
    ).toBeNull();
  });

  it("formats the Web6 Solutions example exactly", () => {
    const banner = formatArrangementBanner({
      arrangement_type: "performance_based_trial",
      arrangement_standard_fee: 750,
      arrangement_upfront_payment: 0,
      arrangement_attribution_period: "60 days",
    });
    expect(banner).toBe("Performance-Based Trial — $0 Upfront | $750 Due on First Conversion | 60-Day Attribution");
  });

  it("omits the attribution clause when no attribution period is set", () => {
    const banner = formatArrangementBanner({
      arrangement_type: "custom_arrangement",
      arrangement_standard_fee: 500,
      arrangement_upfront_payment: 100,
      arrangement_attribution_period: null,
    });
    expect(banner).toBe("Custom Arrangement — $100 Upfront | $500 Due on First Conversion");
  });
});
