import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type Row } from "./fake-supabase";

vi.mock("server-only", () => ({}));

let db = createFakeDb();
const ADMIN = "2101e587-c4fd-40af-914a-46db900ac711";
const HENRY = "79be9174-e168-4f0f-a7b8-7e97f662fc3d";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../leadgen-auth", () => ({ requireLeadgenAdmin: async () => ({ id: ADMIN, full_name: "Admin", email: "info@winsalotcorp.com" }) }));
vi.mock("../leadgen-appointment-notifications", () => ({ notifyOfNewLeadgenAppointment: async () => undefined }));
vi.mock("../appointment-sms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../appointment-sms")>()),
  sendImmediateAppointmentConfirmation: async () => undefined,
}));
// The slot must be "offered" regardless of today's date; everything else in the module is real.
vi.mock("../leadgen-booking", async (importOriginal) => ({ ...(await importOriginal<typeof import("../leadgen-booking")>()), isLeadgenBookingSlotOffered: () => true }));

import { bookLeadgenAppointmentAction } from "../../app/book/[slug]/actions";
import { assignAppointmentCampaignAction, closeBookingReviewItemAction } from "../../app/leadgen/admin/(dashboard)/appointments/review-queue-actions";

const TEK = "cl-teknokraft";
const WEB6 = "cl-web6";
const BRENT = "cl-brents";

function seed(extra: Record<string, Row[]> = {}) {
  db = createFakeDb(
    {
      leadgen_clients: [
        { id: TEK, name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true },
        { id: WEB6, name: "Web6 Solutions", slug: "web6-solutions", active: true },
        { id: BRENT, name: "Brent's Essentials", slug: "brentsessentials", active: true },
      ],
      leadgen_campaigns: [
        { id: "tek-snow", name: "Teknokraft - Snow", client_id: TEK, status: "active" },
        { id: "tek-pest", name: "Teknokraft - Pest", client_id: TEK, status: "active" },
        { id: "tek-paused", name: "Teknokraft - Paused", client_id: TEK, status: "paused" },
        { id: "web6-only", name: "Web6 - Websites", client_id: WEB6, status: "active" },
        { id: "brent-growth", name: "Brent - Growth", client_id: BRENT, status: "active" },
        { id: "q3", name: "Q3 Growth Campaign", client_id: TEK, status: "active" },
      ],
      leadgen_campaign_agents: [{ campaign_id: "tek-snow", agent_id: HENRY }],
      leadgen_leads: [],
      leadgen_appointments: [],
      leadgen_lead_activities: [],
      leadgen_booking_review_queue: [],
      ...extra,
    },
    { defaults: { leadgen_booking_review_queue: { status: "pending" } } }
  );
}
beforeEach(() => seed());

function bookingForm(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const fields = { date: "2026-10-20", time: "10:00", name: "Pat Owner", business_name: "Paws & Co", email: "pat@pets.ca", phone: "+14165551234", ...overrides };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("public booking page: appointment campaign from verified evidence", () => {
  it("uses the matched lead's campaign", async () => {
    seed({ leadgen_leads: [{ id: "lead-1", client_id: TEK, campaign_id: "tek-pest", email: "pat@pets.ca", status: "Interested", created_at: "2026-10-01" }] });
    const result = await bookLeadgenAppointmentAction("teknokraft-canada", bookingForm());
    expect(result.appointmentId).toBeTruthy();
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ client_id: TEK, campaign_id: "tek-pest", lead_id: "lead-1", created_by: null });
    expect(db.tables.leadgen_leads[0]).toMatchObject({ status: "Appointment booked", campaign_id: "tek-pest" });
  });

  it("does not link or borrow the campaign of a look-alike email (SQL wildcard)", async () => {
    seed({ leadgen_leads: [{ id: "other", client_id: TEK, campaign_id: "tek-pest", email: "patzx@pets.ca", status: "New", created_at: "2026-10-01" }] });
    await bookLeadgenAppointmentAction("teknokraft-canada", bookingForm({ email: "pat_x@pets.ca" }));
    // "_" in "pat_x@pets.ca" would wildcard-match "patzx@pets.ca" under plain ILIKE; it must not.
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ lead_id: null, campaign_id: null });
  });

  it("leaves a multi-campaign client's booking unassigned for Admin review rather than guessing", async () => {
    await bookLeadgenAppointmentAction("teknokraft-canada", bookingForm());
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ client_id: TEK, campaign_id: null });
  });

  it("uses a client's single active campaign (existing rule)", async () => {
    await bookLeadgenAppointmentAction("web6-solutions", bookingForm());
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ client_id: WEB6, campaign_id: "web6-only" });
  });

  it("still never auto-assigns a campaign for Brent's Essentials (existing behaviour)", async () => {
    await bookLeadgenAppointmentAction("brentsessentials", bookingForm());
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ client_id: BRENT, campaign_id: null });
  });

  it("rejects an unknown booking page without writing anything, and never touches assignments", async () => {
    const result = await bookLeadgenAppointmentAction("does-not-exist", bookingForm());
    expect(result.error).toBeTruthy();
    expect(db.writes).toHaveLength(0);
    await bookLeadgenAppointmentAction("teknokraft-canada", bookingForm());
    expect(db.writes.some((w) => w.table === "leadgen_campaign_agents" || w.table === "leadgen_users")).toBe(false);
  });
});

describe("Admin: assign a campaign to an appointment in the review queue", () => {
  beforeEach(() => seed({ leadgen_appointments: [{ id: "appt-1", client_id: TEK, campaign_id: null }, { id: "appt-2", client_id: TEK, campaign_id: "tek-snow" }] }));

  it("fills an empty campaign with an active campaign of the appointment's own client", async () => {
    expect(await assignAppointmentCampaignAction("appt-1", "tek-pest")).toEqual({});
    expect(db.tables.leadgen_appointments[0].campaign_id).toBe("tek-pest");
  });

  it("never overwrites a campaign that is already set", async () => {
    expect((await assignAppointmentCampaignAction("appt-2", "tek-pest")).error).toMatch(/already has a campaign/);
    expect(db.tables.leadgen_appointments[1].campaign_id).toBe("tek-snow");
  });

  it("rejects another client's campaign, paused, hidden, unknown and empty choices", async () => {
    for (const campaignId of ["web6-only", "tek-paused", "q3", "nope", ""]) {
      expect((await assignAppointmentCampaignAction("appt-1", campaignId)).error).toBeTruthy();
    }
    expect(db.tables.leadgen_appointments[0].campaign_id).toBeNull();
  });

  it("only edits the appointment's campaign - no lead, assignment or agent changes", async () => {
    await assignAppointmentCampaignAction("appt-1", "tek-pest");
    expect(db.writes.map((w) => w.table)).toEqual(["leadgen_appointments"]);
  });
});

describe("Admin: closing a review item", () => {
  beforeEach(() => seed({ leadgen_booking_review_queue: [{ id: "q1", status: "pending", payload: { keep: "me" } }, { id: "q2", status: "resolved" }] }));

  it("marks a pending item resolved or dismissed, stamping who and when, and keeps the payload", async () => {
    expect(await closeBookingReviewItemAction("q1", "resolved", " booked by hand ")).toEqual({});
    expect(db.tables.leadgen_booking_review_queue[0]).toMatchObject({ status: "resolved", resolved_by: ADMIN, resolution_note: "booked by hand", payload: { keep: "me" } });
    expect(db.tables.leadgen_booking_review_queue[0].resolved_at).toBeTruthy();
  });

  it("does not re-close an item that was already handled", async () => {
    expect((await closeBookingReviewItemAction("q2", "dismissed", "")).error).toMatch(/already handled/);
    expect(db.tables.leadgen_booking_review_queue[1].status).toBe("resolved");
  });
});
