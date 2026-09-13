import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  blockedChannelsOf,
  buildDncCsv,
  normalizeDncEmail,
  normalizePhoneNumber,
  parseDncCsv,
  type DncSuppressionRow,
} from "@/lib/dnc-suppression";
import { dncBadgeLabel } from "@/components/crm-ui/DncBadge";

// Declared and mocked at true module top level (not nested inside a
// describe block) - vi.mock calls are hoisted above everything else in
// the file, so a mock factory referencing a variable declared only inside
// a describe() body would run before that block scope even exists. Same
// convention as call-log-export-auth.test.ts.
const requireCrmAdminMock = vi.fn();
const requireLeadgenAdminMock = vi.fn();
const getAllDncSuppressionsMock = vi.fn();

vi.mock("@/lib/crm-auth", () => ({ requireCrmAdmin: () => requireCrmAdminMock() }));
vi.mock("@/lib/leadgen-auth", () => ({ requireLeadgenAdmin: () => requireLeadgenAdminMock() }));
vi.mock("@/lib/dnc-suppression", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dnc-suppression")>("@/lib/dnc-suppression");
  return { ...actual, getAllDncSuppressions: () => getAllDncSuppressionsMock() };
});

// TEST 5 (brief's own test plan): "Confirm telephone-number formatting
// cannot bypass the restriction" - (416) 555-1234, 416-555-1234, and
// +1 416 555 1234 must all normalize to the same digit string so a
// suppression lookup by any of these forms matches the same row.
describe("normalizePhoneNumber", () => {
  it("normalizes common North American formats to the same digits", () => {
    expect(normalizePhoneNumber("(416) 555-1234")).toBe("4165551234");
    expect(normalizePhoneNumber("416-555-1234")).toBe("4165551234");
    expect(normalizePhoneNumber("+1 416 555 1234")).toBe("4165551234");
    expect(normalizePhoneNumber("1-416-555-1234")).toBe("4165551234");
  });

  it("returns null for empty/missing input", () => {
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
  });

  it("leaves non-NANP-length numbers as their full digit string", () => {
    expect(normalizePhoneNumber("+44 20 7946 0958")).toBe("442079460958");
  });
});

describe("normalizeDncEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeDncEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });
  it("returns null for empty input", () => {
    expect(normalizeDncEmail("")).toBeNull();
    expect(normalizeDncEmail(null)).toBeNull();
  });
});

function makeSuppression(overrides: Partial<DncSuppressionRow> = {}): DncSuppressionRow {
  return {
    id: "s1",
    contact_name: "Jane Doe",
    business_name: "Acme Co",
    phone: "(416) 555-1234",
    normalized_phone: "4165551234",
    email: null,
    contact_id: null,
    source_crm: "growth",
    original_assignment: "Winsalot Corp.",
    reason: "Requested Do Not Call",
    notes: null,
    added_by_user_id: "u1",
    added_by_name: "Agent Smith",
    block_phone: true,
    block_sms: false,
    block_email: false,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    removed_at: null,
    removed_by: null,
    removed_by_name: null,
    removal_reason: null,
    ...overrides,
  };
}

// Item 7: phone-only restriction reads "DO NOT CALL"; anything broader
// reads the all-encompassing "DO NOT CONTACT".
describe("dncBadgeLabel / blockedChannelsOf", () => {
  it("labels a phone-only restriction as DO NOT CALL", () => {
    const row = makeSuppression({ block_phone: true, block_sms: false, block_email: false });
    expect(dncBadgeLabel(row)).toBe("DO NOT CALL");
    expect(blockedChannelsOf(row)).toEqual(["phone"]);
  });

  it("labels a multi-channel restriction as DO NOT CONTACT", () => {
    const row = makeSuppression({ block_phone: true, block_sms: true, block_email: true });
    expect(dncBadgeLabel(row)).toBe("DO NOT CONTACT");
    expect(blockedChannelsOf(row)).toEqual(["phone", "sms", "email"]);
  });

  it("labels an email-only restriction as DO NOT CONTACT", () => {
    const row = makeSuppression({ block_phone: false, block_sms: false, block_email: true });
    expect(dncBadgeLabel(row)).toBe("DO NOT CONTACT");
    expect(blockedChannelsOf(row)).toEqual(["email"]);
  });
});

describe("CSV export/import", () => {
  it("round-trips a suppression row through buildDncCsv", () => {
    const csv = buildDncCsv([makeSuppression()]);
    expect(csv).toContain("Acme Co");
    expect(csv).toContain("4165551234");
    expect(csv).toContain("Growth CRM");
  });

  it("parses a CSV with Business Name/Phone/Email/Reason columns", () => {
    const csv = "Business Name,Phone,Email,Reason\nAcme Co,416-555-1234,jane@example.com,Requested opt-out";
    const { rows, errors } = parseDncCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ business_name: "Acme Co", phone: "416-555-1234", email: "jane@example.com", reason: "Requested opt-out" }]);
  });

  it("rejects a CSV with neither a Phone nor an Email column", () => {
    const csv = "Business Name,Reason\nAcme Co,Requested opt-out";
    const { rows, errors } = parseDncCsv(csv);
    expect(rows).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("skips a row with no phone or email", () => {
    const csv = "Business Name,Phone,Email\nAcme Co,,";
    const { rows, errors } = parseDncCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/no phone number or email/);
  });
});

// TEST 7 (brief's own test plan): "Confirm CSV export is Admin-only" -
// hitting either CRM's export route directly must be turned away by
// requireCrmAdmin()/requireLeadgenAdmin() before any suppression data is
// read, same convention as call-log-export-auth.test.ts.
describe("Do Not Contact CSV export routes are admin-gated", () => {
  beforeEach(() => {
    requireCrmAdminMock.mockReset();
    requireLeadgenAdminMock.mockReset();
    getAllDncSuppressionsMock.mockReset();
    getAllDncSuppressionsMock.mockResolvedValue([]);
  });

  it("Growth CRM export route rejects a non-admin before reading any data", async () => {
    requireCrmAdminMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const { GET } = await import("@/app/admin/(dashboard)/crm/do-not-contact/export/route");
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT");
    expect(getAllDncSuppressionsMock).not.toHaveBeenCalled();
  });

  it("Lead Generation CRM export route rejects a non-admin before reading any data", async () => {
    requireLeadgenAdminMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const { GET } = await import("@/app/leadgen/admin/(dashboard)/do-not-contact/export/route");
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT");
    expect(getAllDncSuppressionsMock).not.toHaveBeenCalled();
  });

  it("Growth CRM export route reads the shared suppression table once an admin is confirmed", async () => {
    requireCrmAdminMock.mockResolvedValue({ id: "admin1" });
    const { GET } = await import("@/app/admin/(dashboard)/crm/do-not-contact/export/route");
    const response = await GET();
    expect(getAllDncSuppressionsMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
  });
});
