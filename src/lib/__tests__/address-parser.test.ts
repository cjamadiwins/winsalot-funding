import { describe, expect, it } from "vitest";
import { parseAddressComponents } from "../address-parser";

describe("parseAddressComponents", () => {
  it("parses a full Canadian address with country", () => {
    const result = parseAddressComponents("123 Main St, Winnipeg, MB R3C 0V8, Canada");
    expect(result).toEqual({ city: "Winnipeg", province: "MB", postalCode: "R3C 0V8", country: "Canada" });
  });

  it("parses a Canadian address without an explicit country, inferring it from the postal code", () => {
    const result = parseAddressComponents("456 Queen St, Mississauga, ON L5B 1M2");
    expect(result).toEqual({ city: "Mississauga", province: "ON", postalCode: "L5B 1M2", country: "Canada" });
  });

  it("parses a Canadian address with province and postal code combined in the last segment", () => {
    const result = parseAddressComponents("789 King St, Toronto, ON, M5V 2T6");
    expect(result).toEqual({ city: "Toronto", province: "ON", postalCode: "M5V 2T6", country: "Canada" });
  });

  it("parses a full US address with country", () => {
    const result = parseAddressComponents("100 Elm St, Austin, TX 73301, United States");
    expect(result).toEqual({ city: "Austin", province: "TX", postalCode: "73301", country: "United States" });
  });

  it("parses a US address without an explicit country, inferring it from the state", () => {
    const result = parseAddressComponents("100 Elm St, Austin, Texas 73301");
    expect(result).toEqual({ city: "Austin", province: "TX", postalCode: "73301", country: "United States" });
  });

  it("parses province full name spelled out", () => {
    const result = parseAddressComponents("1 Rue Principale, Montreal, Quebec H2X 1Y4");
    expect(result).toEqual({ city: "Montreal", province: "QC", postalCode: "H2X 1Y4", country: "Canada" });
  });

  it("leaves everything blank for a bare street address with no segmentation", () => {
    const result = parseAddressComponents("123 Main Street");
    expect(result).toEqual({ city: "", province: "", postalCode: "", country: "" });
  });

  it("does not mistake a street number for a US ZIP code when there is no comma", () => {
    const result = parseAddressComponents("12345 Main Street");
    expect(result.postalCode).toBe("");
  });

  it("does not invent a city when no province or postal code can be found", () => {
    const result = parseAddressComponents("123 Main Street, Some Unrecognized Place");
    expect(result).toEqual({ city: "", province: "", postalCode: "", country: "" });
  });

  it("returns all-blank for an empty string", () => {
    expect(parseAddressComponents("")).toEqual({ city: "", province: "", postalCode: "", country: "" });
    expect(parseAddressComponents("   ")).toEqual({ city: "", province: "", postalCode: "", country: "" });
  });

  it("parses city and province with no postal code or country present", () => {
    const result = parseAddressComponents("50 Bay St, Winnipeg, MB");
    expect(result).toEqual({ city: "Winnipeg", province: "MB", postalCode: "", country: "Canada" });
  });

  it("does not mistake a unit/suite number for a postal code, and finds city past it", () => {
    const result = parseAddressComponents("500 King St, Suite 100, Toronto, ON M5V 2T6");
    expect(result).toEqual({ city: "Toronto", province: "ON", postalCode: "M5V 2T6", country: "Canada" });
  });

  it("handles lowercase province/country input", () => {
    const result = parseAddressComponents("123 Main St, Calgary, ab t2p 1j9, canada");
    expect(result).toEqual({ city: "Calgary", province: "AB", postalCode: "T2P 1J9", country: "Canada" });
  });
});
