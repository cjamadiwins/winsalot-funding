import { describe, expect, it } from "vitest";
import { clientHasRelatedRecords, describeClientRelatedRecords, formatCurrency, type ClientRelatedCounts } from "../crm-clients-types";

const emptyCounts: ClientRelatedCounts = { appointments: 0, invoices: 0, payments: 0, assignedAgents: 0, activities: 0 };

describe("clientHasRelatedRecords", () => {
  it("is false when every count is zero", () => {
    expect(clientHasRelatedRecords(emptyCounts)).toBe(false);
  });

  it("is true when any single count is non-zero", () => {
    expect(clientHasRelatedRecords({ ...emptyCounts, appointments: 1 })).toBe(true);
    expect(clientHasRelatedRecords({ ...emptyCounts, invoices: 1 })).toBe(true);
    expect(clientHasRelatedRecords({ ...emptyCounts, payments: 1 })).toBe(true);
    expect(clientHasRelatedRecords({ ...emptyCounts, assignedAgents: 1 })).toBe(true);
    expect(clientHasRelatedRecords({ ...emptyCounts, activities: 1 })).toBe(true);
  });
});

describe("describeClientRelatedRecords", () => {
  it("returns an empty string when nothing exists", () => {
    expect(describeClientRelatedRecords(emptyCounts)).toBe("");
  });

  it("lists every non-zero count with correct pluralization", () => {
    const description = describeClientRelatedRecords({ appointments: 1, invoices: 2, payments: 0, assignedAgents: 1, activities: 3 });
    expect(description).toBe("1 appointment, 2 invoices, 1 assigned agent, 3 activity records");
  });
});

describe("formatCurrency", () => {
  it("formats a positive amount in USD by default", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
  });

  it("treats a null/undefined amount as zero", () => {
    expect(formatCurrency(null, "USD")).toBe("$0.00");
    expect(formatCurrency(undefined, "USD")).toBe("$0.00");
  });

  it("falls back to USD when currency is missing", () => {
    expect(formatCurrency(10, null)).toBe("$10.00");
  });
});
