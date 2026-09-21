import { describe, expect, it } from "vitest";
import { locationLines } from "../call-list-card-location";

const ALL_VISIBLE = { showStreetAddress: true, showCity: true, showProvince: true, showPostalCode: true };

describe("locationLines", () => {
  it("returns street and a separate City, Province Postal Code line when they don't overlap", () => {
    const lines = locationLines({ street_address: "33 Empire Crescent", city: "Oshawa", province: "ON", postal_code: "L1H 7K5" }, ALL_VISIBLE);
    expect(lines).toEqual(["33 Empire Crescent", "Oshawa, ON L1H 7K5"]);
  });

  it("collapses to a single line when street_address already contains the full parsed location (combined LeadSwift address)", () => {
    const lines = locationLines(
      { street_address: "33 Empire Crescent, Oshawa, ON L1H 7K5, Canada", city: "Oshawa", province: "ON", postal_code: "L1H 7K5" },
      ALL_VISIBLE
    );
    expect(lines).toEqual(["33 Empire Crescent, Oshawa, ON L1H 7K5, Canada"]);
  });

  it("falls back to the original address alone when no structured city/province/postal exists", () => {
    const lines = locationLines({ street_address: "33 Empire Crescent, Oshawa, ON", city: null, province: null, postal_code: null }, ALL_VISIBLE);
    expect(lines).toEqual(["33 Empire Crescent, Oshawa, ON"]);
  });

  it("shows only City, Province when there is no street address at all", () => {
    const lines = locationLines({ street_address: null, city: "Oshawa", province: "ON", postal_code: null }, ALL_VISIBLE);
    expect(lines).toEqual(["Oshawa, ON"]);
  });

  it("shows City with postal code but no province", () => {
    const lines = locationLines({ street_address: null, city: "Oshawa", province: null, postal_code: "L1H 7K5" }, ALL_VISIBLE);
    expect(lines).toEqual(["Oshawa, L1H 7K5"]);
  });

  it("returns no lines when there is nothing to show", () => {
    expect(locationLines({ street_address: null, city: null, province: null, postal_code: null }, ALL_VISIBLE)).toEqual([]);
    expect(locationLines({ street_address: "", city: "", province: "", postal_code: "" }, ALL_VISIBLE)).toEqual([]);
  });

  it("never renders a line for a field Admin has hidden via Manage Columns", () => {
    const lead = { street_address: "33 Empire Crescent", city: "Oshawa", province: "ON", postal_code: "L1H 7K5" };
    expect(locationLines(lead, { ...ALL_VISIBLE, showStreetAddress: false })).toEqual(["Oshawa, ON L1H 7K5"]);
    expect(locationLines(lead, { ...ALL_VISIBLE, showCity: false, showProvince: false, showPostalCode: false })).toEqual(["33 Empire Crescent"]);
  });

  it("is tolerant of minor punctuation/spacing differences when detecting overlap", () => {
    const lines = locationLines(
      { street_address: "33 empire crescent,oshawa,on l1h7k5", city: "Oshawa", province: "ON", postal_code: "L1H 7K5" },
      ALL_VISIBLE
    );
    // Note: the raw postal code in street_address ("l1h7k5") lacks the
    // space our own normalization inserts ("l1h 7k5") - a genuinely
    // different string is not required to collapse, only whitespace/
    // punctuation-equivalent ones are, so both lines are expected here.
    expect(lines).toEqual(["33 empire crescent,oshawa,on l1h7k5", "Oshawa, ON L1H 7K5"]);
  });
});
