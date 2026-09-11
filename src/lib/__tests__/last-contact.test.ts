import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPES, isDirectContactActivityType } from "../crm-types";
import { buildLeadCardRecords, latestLeadgenEmailByLeadId, type LeadCardSource } from "../leadgen-dashboard-records";

// "Last Contact" must reflect a genuine direct interaction with the
// prospect - a delivered/sent email alone never counts, even when it's
// logged through the generic Add Activity form (Growth CRM) or sent via
// one of the automated consultation-email actions (Lead Gen CRM). These
// tests cover the shared, pure logic behind that rule; the action-file
// write sites themselves (addActivityAction, addOpportunityActivityAction,
// sendConsultationEmailAction, etc.) are covered by code inspection - see
// the PR description - since exercising them needs the full session/
// cookie mocking stack for little additional coverage over this file.
describe("isDirectContactActivityType (Growth CRM)", () => {
  it("excludes only the two email-channel activity types", () => {
    expect(isDirectContactActivityType("email")).toBe(false);
    expect(isDirectContactActivityType("email_resubscribed")).toBe(false);
  });

  it("treats every other logged activity type as direct contact", () => {
    const nonEmailTypes = ACTIVITY_TYPES.filter((type) => type !== "email" && type !== "email_resubscribed");
    expect(nonEmailTypes).toEqual(
      expect.arrayContaining(["call", "text", "voicemail", "note", "outcome", "consultation_booked", "consultation_rescheduled", "consultation_cancelled"])
    );
    for (const type of nonEmailTypes) {
      expect(isDirectContactActivityType(type)).toBe(true);
    }
  });
});

describe("latestLeadgenEmailByLeadId (Lead Gen CRM)", () => {
  it("picks the most recent email per lead by status timestamp, not insertion order", () => {
    const result = latestLeadgenEmailByLeadId([
      { lead_id: "lead-1", status: "sent", to_email: "a@example.com", sent_at: "2026-01-01T00:00:00.000Z", delivered_at: null, delayed_at: null, bounced_at: null, complained_at: null, opened_at: null, clicked_at: null, failed_at: null, created_at: "2026-01-01T00:00:00.000Z" },
      { lead_id: "lead-1", status: "delivered", to_email: "a@example.com", sent_at: "2026-01-02T00:00:00.000Z", delivered_at: "2026-01-02T00:05:00.000Z", delayed_at: null, bounced_at: null, complained_at: null, opened_at: null, clicked_at: null, failed_at: null, created_at: "2026-01-02T00:00:00.000Z" },
      { lead_id: "lead-2", status: "bounced", to_email: "b@example.com", sent_at: "2026-01-01T00:00:00.000Z", delivered_at: null, delayed_at: null, bounced_at: "2026-01-01T00:10:00.000Z", complained_at: null, opened_at: null, clicked_at: null, failed_at: null, created_at: "2026-01-01T00:00:00.000Z" },
    ]);

    expect(result.get("lead-1")).toEqual({ status: "delivered", to_email: "a@example.com", statusAt: "2026-01-02T00:05:00.000Z" });
    expect(result.get("lead-2")).toEqual({ status: "bounced", to_email: "b@example.com", statusAt: "2026-01-01T00:10:00.000Z" });
    expect(result.has("lead-3")).toBe(false);
  });

  it("skips rows with no lead_id (appointment-only sends)", () => {
    const result = latestLeadgenEmailByLeadId([
      { lead_id: null, status: "sent", to_email: "c@example.com", sent_at: "2026-01-01T00:00:00.000Z", delivered_at: null, delayed_at: null, bounced_at: null, complained_at: null, opened_at: null, clicked_at: null, failed_at: null, created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(result.size).toBe(0);
  });
});

describe("buildLeadCardRecords keeps Last Contact and Latest Email Activity independent", () => {
  const baseLead: LeadCardSource = {
    id: "lead-1",
    business_name: "Acme Co.",
    contact_name: null,
    phone: null,
    email: null,
    status: "New",
    assigned_agent_id: null,
    last_contacted_at: null,
    next_follow_up_at: null,
    notes: null,
  };

  it("a lead with only email activity keeps last_contacted_at null while lastEmailStatus is populated", () => {
    const [record] = buildLeadCardRecords([baseLead], {
      latestEmailByLeadId: new Map([["lead-1", { status: "delivered", to_email: "owner@acme.example", statusAt: "2026-02-01T12:00:00.000Z" }]]),
    });

    expect(record.last_contacted_at).toBeNull();
    expect(record.lastEmailStatus).toBe("delivered");
    expect(record.lastEmailAt).toBe("2026-02-01T12:00:00.000Z");
    expect(record.lastEmailTo).toBe("owner@acme.example");
  });

  it("a lead with a logged call has a real last_contacted_at independent of any email activity", () => {
    const [record] = buildLeadCardRecords(
      [{ ...baseLead, last_contacted_at: "2026-02-02T14:00:00.000Z" }],
      {
        scores: [{ lead_id: "lead-1", signals: { last_call_outcome: "Spoke with owner" } }],
        latestEmailByLeadId: new Map([["lead-1", { status: "sent", to_email: "owner@acme.example", statusAt: "2026-01-15T09:00:00.000Z" }]]),
      }
    );

    expect(record.last_contacted_at).toBe("2026-02-02T14:00:00.000Z");
    expect(record.lastCallOutcome).toBe("Spoke with owner");
    expect(record.lastEmailStatus).toBe("sent");
  });

  it("a lead with no data at all reports no contact and no email", () => {
    const [record] = buildLeadCardRecords([baseLead]);
    expect(record.last_contacted_at).toBeNull();
    expect(record.lastEmailStatus).toBeNull();
    expect(record.lastEmailAt).toBeNull();
    expect(record.lastEmailTo).toBeNull();
  });
});
