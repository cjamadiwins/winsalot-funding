import { describe, expect, it } from "vitest";
import {
  AGENT_PRICING_REMINDER,
  activeServices,
  formatMoneyAmount,
  formatServicePrice,
  isStartingAtPrice,
  normalizeServiceInput,
  parseServiceLines,
  serviceToFormInput,
  sortServices,
  type ClientServiceRow,
  type ServiceFormInput,
} from "../leadgen-client-services";

const price = (pricing_type: ClientServiceRow["pricing_type"], price_amount: number | string | null, extra: Partial<ClientServiceRow> = {}) =>
  formatServicePrice({ entry_type: "service", pricing_type, price_amount, currency: "CAD", plus_taxes: true, ...extra });

describe("formatServicePrice - Hidebrandt Web Services pricing", () => {
  it("brochure website: Starting at CA$465 + applicable taxes", () => expect(price("starting_at", 465)).toBe("Starting at CA$465 + applicable taxes"));
  it("e-commerce: Starting at CA$1,395 + applicable taxes", () => expect(price("starting_at", "1395.00")).toBe("Starting at CA$1,395 + applicable taxes"));
  it("hosting: CA$10/month + applicable taxes", () => expect(price("monthly", "10.00")).toBe("CA$10/month + applicable taxes"));
  it("domain + SSL: CA$50/year + applicable taxes", () => expect(price("annual", 50)).toBe("CA$50/year + applicable taxes"));
  it("custom work: CA$46.50/hour + applicable taxes", () => expect(price("hourly", "46.50")).toBe("CA$46.50/hour + applicable taxes"));
});

describe("formatServicePrice - formats and edge cases", () => {
  it("fixed price and custom quote", () => {
    expect(price("fixed", 1200)).toBe("CA$1,200 + applicable taxes");
    expect(price("custom_quote", null)).toBe("Custom quote");
    expect(price("fixed", null)).toBe("Custom quote");
  });
  it("omits the tax suffix when not applicable, and supports other currencies", () => {
    expect(price("fixed", 99, { plus_taxes: false })).toBe("CA$99");
    expect(price("monthly", 20, { currency: "USD" })).toBe("US$20/month + applicable taxes");
    expect(formatMoneyAmount(5, "EUR")).toBe("EUR 5");
  });
  it("a reference note has no price", () => {
    expect(formatServicePrice({ entry_type: "note", pricing_type: null, price_amount: null, currency: "CAD", plus_taxes: true })).toBeNull();
  });
  it("flags only 'Starting at' prices for the agent reminder", () => {
    expect(isStartingAtPrice({ pricing_type: "starting_at" })).toBe(true);
    expect(isStartingAtPrice({ pricing_type: "hourly" })).toBe(false);
    expect(AGENT_PRICING_REMINDER).toMatch(/Starting at/);
    expect(AGENT_PRICING_REMINDER).toMatch(/final quote/);
  });
});

const base: ServiceFormInput = {
  entry_type: "service",
  name: " Brochure-Style Website ",
  description: "  desc ",
  pricing_type: "starting_at",
  price_amount: "$1,395.50",
  currency: "cad",
  plus_taxes: true,
  price_condition: " Two-year signup ",
  included: "- Contact form\n\n2) Up to 15 pages\n• Image gallery",
  additional_costs: "Plugins\nExtensions",
  technical_notes: "",
  sales_notes: "note",
  is_active: true,
};

describe("normalizeServiceInput", () => {
  it("trims, parses the price, upper-cases the currency and de-bullets lists", () => {
    const result = normalizeServiceInput(base);
    expect("value" in result && result.value).toMatchObject({
      entry_type: "service",
      name: "Brochure-Style Website",
      description: "desc",
      pricing_type: "starting_at",
      price_amount: 1395.5,
      currency: "CAD",
      price_condition: "Two-year signup",
      included: ["Contact form", "Up to 15 pages", "Image gallery"],
      additional_costs: ["Plugins", "Extensions"],
      technical_notes: null,
      sales_notes: "note",
    });
  });
  it("requires a name, a valid type and a numeric price for priced services", () => {
    expect(normalizeServiceInput({ ...base, name: "  " })).toEqual({ error: "A name is required." });
    expect(normalizeServiceInput({ ...base, entry_type: "bogus" })).toHaveProperty("error");
    expect(normalizeServiceInput({ ...base, pricing_type: "weekly" })).toHaveProperty("error");
    expect(normalizeServiceInput({ ...base, price_amount: "" })).toHaveProperty("error");
    expect(normalizeServiceInput({ ...base, price_amount: "abc" })).toHaveProperty("error");
    expect(normalizeServiceInput({ ...base, currency: "dollars" })).toHaveProperty("error");
  });
  it("a custom quote needs no amount, and a note carries no price", () => {
    const quote = normalizeServiceInput({ ...base, pricing_type: "custom_quote", price_amount: "" });
    expect("value" in quote && quote.value.price_amount).toBeNull();
    const note = normalizeServiceInput({ ...base, entry_type: "note", pricing_type: "starting_at", price_amount: "99", price_condition: "x" });
    expect("value" in note && note.value).toMatchObject({ pricing_type: null, price_amount: null, price_condition: null });
  });
  it("round-trips a stored row back into the form", () => {
    const row = { entry_type: "service", name: "Hosting", description: null, pricing_type: "monthly", price_amount: "10.00", currency: "CAD", plus_taxes: true, price_condition: "Two-year signup", included: ["a"], additional_costs: [], technical_notes: null, sales_notes: null, is_active: true } as unknown as ClientServiceRow;
    expect(serviceToFormInput(row)).toMatchObject({ pricing_type: "monthly", price_amount: "10", included: "a", price_condition: "Two-year signup" });
    expect(serviceToFormInput(null)).toMatchObject({ entry_type: "service", currency: "CAD", plus_taxes: true, is_active: true });
  });
  it("parseServiceLines caps and cleans", () => {
    expect(parseServiceLines("  - a \n\n b")).toEqual(["a", "b"]);
    expect(parseServiceLines(Array.from({ length: 50 }, (_, i) => `x${i}`).join("\n"))).toHaveLength(30);
  });
});

describe("ordering and visibility", () => {
  const row = (name: string, sort_order: number, is_active = true, created_at = "2026-01-01") => ({ name, sort_order, is_active, created_at }) as ClientServiceRow;
  it("sorts by order, then created, then name; agents' view keeps only active", () => {
    const rows = [row("C", 20), row("B", 10, true, "2026-02-01"), row("A", 10), row("D", 30, false)];
    expect(sortServices(rows).map((r) => r.name)).toEqual(["A", "B", "C", "D"]);
    expect(activeServices(rows).map((r) => r.name).sort()).toEqual(["A", "B", "C"]);
    expect(activeServices(rows).some((r) => !r.is_active)).toBe(false);
  });
});
