import { describe, expect, it } from "vitest";
import {
  applyColumnMapping,
  buildMappableHeaders,
  describeHeaderOption,
  guessColumnMapping,
} from "../call-list-column-mapping";
import { parseCsvRows } from "../leadgen-csv";

// Regression coverage for the reported bug: a real LeadSwift export whose
// business-name column is headered just "Name" was rejected with
// "Couldn't find a Business Name column" because the old synonym lists
// let contact_name's bare "name" entry claim the header before
// business_name (which didn't list "name" at all) ever got a look at it.
describe("guessColumnMapping - LeadSwift-style headers", () => {
  it("maps a bare 'Name' column to business_name, not contact_name", () => {
    const headers = ["Name", "Category", "Phone", "Email", "Website", "City", "State"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    expect(mapping.business_name).toBe("Name");
    expect(mapping.contact_name).toBeNull();
    expect(mapping.industry).toBe("Category");
    expect(mapping.phone).toBe("Phone");
    expect(mapping.email).toBe("Email");
    expect(mapping.website).toBe("Website");
    expect(mapping.city).toBe("City");
    expect(mapping.province).toBe("State");
  });

  it("recognizes every requested Business Name variant", () => {
    for (const header of ["Business Name", "Company Name", "Company", "Business", "Organization", "Organisation", "Name"]) {
      const mapping = guessColumnMapping(buildMappableHeaders([header, "Phone"]));
      expect(mapping.business_name, `expected "${header}" to map to business_name`).toBe(header);
    }
  });

  it("recognizes common Phone/Email/Website variants", () => {
    const headers = ["Company", "Business Phone", "Contact Email", "URL"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    expect(mapping.phone).toBe("Business Phone");
    expect(mapping.email).toBe("Contact Email");
    expect(mapping.website).toBe("URL");
  });

  it("recognizes Province/State and Industry/Category variants", () => {
    const headers = ["Company", "State", "Category"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    expect(mapping.province).toBe("State");
    expect(mapping.industry).toBe("Category");
  });

  it("combines separate First Name / Last Name columns into a synthesized contact_name option", () => {
    const headers = ["Company", "First Name", "Last Name", "Business Phone"];
    const mappable = buildMappableHeaders(headers);
    expect(mappable).toHaveLength(5); // 4 real headers + 1 synthesized combine option
    const mapping = guessColumnMapping(mappable);
    expect(mapping.contact_name).toBe("__combine__:First Name|Last Name");
    expect(describeHeaderOption(mapping.contact_name!)).toBe("First Name + Last Name (combined)");
  });

  it("never guesses a mapping the file doesn't have", () => {
    const mapping = guessColumnMapping(buildMappableHeaders(["Company"]));
    expect(mapping.phone).toBeNull();
    expect(mapping.email).toBeNull();
  });
});

describe("applyColumnMapping", () => {
  it("resolves a combined First+Last Name mapping into one contact_name value", () => {
    const headers = ["Company", "First Name", "Last Name", "Business Phone"];
    const row = ["Acme Roofing", "Jane", "Doe", "204-555-0100"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    const result = applyColumnMapping(headers, row, mapping);
    expect(result.business_name).toBe("Acme Roofing");
    expect(result.contact_name).toBe("Jane Doe");
    expect(result.phone).toBe("204-555-0100");
    // First Name / Last Name were consumed by the combine mapping, so they
    // must not also leak into extra_fields.
    expect(result.extra_fields).toEqual({});
  });

  it("keeps every unmapped column in extra_fields instead of discarding it", () => {
    const headers = ["Name", "Rating", "Reviews Count"];
    const row = ["Acme Roofing", "4.8", "132"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    const result = applyColumnMapping(headers, row, mapping);
    expect(result.business_name).toBe("Acme Roofing");
    expect(result.extra_fields).toEqual({ Rating: "4.8", "Reviews Count": "132" });
  });

  it("handles a first/last name combo alongside an unrelated extra column", () => {
    const headers = ["Business", "First Name", "Last Name", "Notes"];
    const row = ["Bob's Plumbing", "Bob", "Smith", "Left voicemail"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    const result = applyColumnMapping(headers, row, mapping);
    expect(result.contact_name).toBe("Bob Smith");
    expect(result.notes).toBe("Left voicemail");
  });

  it("parses City/Province/Postal Code/Country out of a single combined address column, preserving the original address verbatim", () => {
    const headers = ["Business Name", "Address"];
    const row = ["Prairie Web Design", "123 Main St, Winnipeg, MB R3C 0V8, Canada"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    const result = applyColumnMapping(headers, row, mapping);
    expect(result.street_address).toBe("123 Main St, Winnipeg, MB R3C 0V8, Canada");
    expect(result.city).toBe("Winnipeg");
    expect(result.province).toBe("MB");
    expect(result.postal_code).toBe("R3C 0V8");
    expect(result.country).toBe("Canada");
  });

  it("never overwrites an explicit City/Province column with a value parsed from the combined address", () => {
    const headers = ["Business Name", "Address", "City", "Province"];
    // Deliberately conflicting - the explicit columns must win.
    const row = ["Prairie Web Design", "123 Main St, Winnipeg, MB R3C 0V8, Canada", "Brandon", "MB"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    const result = applyColumnMapping(headers, row, mapping);
    expect(result.city).toBe("Brandon");
    expect(result.province).toBe("MB");
    // Postal Code/Country had no explicit column, so parsing still fills
    // those in.
    expect(result.postal_code).toBe("R3C 0V8");
    expect(result.country).toBe("Canada");
  });

  it("leaves City/Province/Postal Code/Country blank rather than guessing when the combined address can't be confidently parsed", () => {
    const headers = ["Business Name", "Address"];
    const row = ["Prairie Web Design", "123 Main St"];
    const mapping = guessColumnMapping(buildMappableHeaders(headers));
    const result = applyColumnMapping(headers, row, mapping);
    expect(result.street_address).toBe("123 Main St");
    expect(result.city).toBe("");
    expect(result.province).toBe("");
    expect(result.postal_code).toBe("");
    expect(result.country).toBe("");
  });
});

describe("end-to-end: a realistic LeadSwift CSV export", () => {
  const csv = [
    "Name,Category,Phone,Email,Website,City,State,Full Address",
    'Prairie Web Design,Website Designer,204-555-0111,info@prairieweb.ca,prairieweb.ca,Winnipeg,MB,"123 Main St, Winnipeg, MB"',
    'Northgate Web Studio,Website Designer,204-555-0122,,northgateweb.ca,Winnipeg,MB,"456 Elm St, Winnipeg, MB"',
  ].join("\n");

  it("imports without requiring the admin to rename any column first", () => {
    const rows = parseCsvRows(csv);
    const [headerRow, ...dataRows] = rows;
    const mappable = buildMappableHeaders(headerRow);
    const mapping = guessColumnMapping(mappable);

    // This is exactly the check the upload action performs - it must
    // never fail for a plain "Name" column.
    expect(mapping.business_name).toBe("Name");

    const mappedRows = dataRows.map((row) => applyColumnMapping(headerRow, row, mapping));
    expect(mappedRows[0].business_name).toBe("Prairie Web Design");
    expect(mappedRows[0].phone).toBe("204-555-0111");
    expect(mappedRows[0].email).toBe("info@prairieweb.ca");
    expect(mappedRows[0].city).toBe("Winnipeg");
    expect(mappedRows[0].province).toBe("MB");
    expect(mappedRows[0].industry).toBe("Website Designer");
    expect(mappedRows[0].extra_fields).toEqual({ "Full Address": "123 Main St, Winnipeg, MB" });
    expect(mappedRows[1].email).toBe("");
  });
});
