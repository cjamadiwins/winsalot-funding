import { describe, expect, it } from "vitest";
import { formatArrangementBanner } from "../commercial-arrangement";

const NO_SPLIT_PAYMENT_FIELDS = { arrangement_total_value: null, arrangement_milestone_1_amount: null, arrangement_milestone_2_amount: null };

describe("formatArrangementBanner", () => {
  it("returns null for a Standard Monthly arrangement", () => {
    expect(
      formatArrangementBanner({
        arrangement_type: "standard_monthly",
        arrangement_standard_fee: 750,
        arrangement_upfront_payment: 0,
        arrangement_attribution_period: null,
        ...NO_SPLIT_PAYMENT_FIELDS,
      })
    ).toBeNull();
  });

  it("formats the Web6 Solutions example exactly", () => {
    const banner = formatArrangementBanner({
      arrangement_type: "performance_based_trial",
      arrangement_standard_fee: 750,
      arrangement_upfront_payment: 0,
      arrangement_attribution_period: "60 days",
      ...NO_SPLIT_PAYMENT_FIELDS,
    });
    expect(banner).toBe("Performance-Based Trial — $0 Upfront | $750 Due on First Conversion | 60-Day Attribution");
  });

  it("omits the attribution clause when no attribution period is set", () => {
    const banner = formatArrangementBanner({
      arrangement_type: "custom_arrangement",
      arrangement_standard_fee: 500,
      arrangement_upfront_payment: 100,
      arrangement_attribution_period: null,
      ...NO_SPLIT_PAYMENT_FIELDS,
    });
    expect(banner).toBe("Custom Arrangement — $100 Upfront | $500 Due on First Conversion");
  });

  it("formats the Teknokraft Canada Inc. custom split-payment example exactly", () => {
    const banner = formatArrangementBanner({
      arrangement_type: "custom_split_payment",
      arrangement_standard_fee: 750,
      arrangement_upfront_payment: 250,
      arrangement_attribution_period: null,
      arrangement_total_value: 750,
      arrangement_milestone_1_amount: 250,
      arrangement_milestone_2_amount: 250,
    });
    expect(banner).toBe("Custom – Split Payment / Performance Milestones — $250 Deposit | $250 + $250 Milestones | $750 Total");
  });
});
