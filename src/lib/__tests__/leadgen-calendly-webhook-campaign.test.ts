import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { createFakeDb, type Row } from "./fake-supabase";

vi.mock("server-only", () => ({}));

const SIGNING_KEY = "test-signing-key";
let db = createFakeDb();
const notify = vi.fn(async () => undefined);
const confirm = vi.fn(async () => undefined);

vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../leadgen-appointment-notifications", () => ({ notifyOfNewLeadgenAppointment: (...args: unknown[]) => notify(...(args as [])) }));
vi.mock("../appointment-sms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../appointment-sms")>()),
  sendImmediateAppointmentConfirmation: (...args: unknown[]) => confirm(...(args as [])),
}));

import { POST } from "../../app/api/webhooks/calendly/route";

const TEK = "cl-teknokraft";
const HENRY = "79be9174-e168-4f0f-a7b8-7e97f662fc3d";
const GOODNESS = "a8f77781-daed-4c5c-b8fa-09c27609ae14";
const tekCampaigns = ["snow", "pest", "oakville", "ottawa", "niagara", "clarington"].map((n) => ({ id: `tek-${n}`, client_id: TEK, status: "active" }));

function seed(extra: Record<string, Row[]> = {}, options: { failTables?: string[] } = {}) {
  // Column defaults a real table would apply.
  const defaults = { leadgen_booking_review_queue: { status: "pending" } };
  db = createFakeDb(
    {
      leadgen_clients: [
        { id: TEK, name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true, calendly_event_type_uri: "evt-tek", booking_link: "https://calendly.com/tek" },
      ],
      leadgen_campaigns: tekCampaigns,
      leadgen_campaign_agents: [{ campaign_id: "tek-snow", agent_id: HENRY }],
      leadgen_users: [
        { id: HENRY, role: "agent", current_campaign_id: "tek-snow" },
        { id: GOODNESS, role: "agent", current_campaign_id: "hid-1" },
      ],
      leadgen_leads: [],
      leadgen_appointments: [],
      leadgen_lead_activities: [],
      leadgen_booking_review_queue: [],
      ...extra,
    },
    { ...options, defaults }
  );
}

function inviteePayload(overrides: Record<string, unknown> = {}) {
  return {
    uri: "https://api.calendly.com/scheduled_events/E1/invitees/I1",
    name: "Pat Owner",
    email: "pat@pets.ca",
    timezone: "America/Toronto",
    text_reminder_number: "+14165551234",
    questions_and_answers: [{ question: "Business name", answer: "Paws & Co" }],
    scheduled_event: { start_time: "2026-10-20T15:00:00Z", event_type: "evt-tek" },
    ...overrides,
  };
}

function request(event: string, payload: unknown, opts: { badSignature?: boolean } = {}) {
  const body = JSON.stringify({ event, payload });
  const t = Math.floor(Date.now() / 1000);
  const signature = opts.badSignature ? "deadbeef" : createHmac("sha256", SIGNING_KEY).update(`${t}.${body}`).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/calendly", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "calendly-webhook-signature": `t=${t},v1=${signature}` },
  });
}

const writesTo = (table: string) => db.writes.filter((w) => w.table === table);

beforeEach(() => {
  process.env.CALENDLY_WEBHOOK_SIGNING_KEY = SIGNING_KEY;
  notify.mockClear();
  confirm.mockClear();
  seed();
});

describe("Calendly webhook: signature", () => {
  it("rejects an unsigned/invalid request and writes nothing", async () => {
    const response = await POST(request("invitee.created", inviteePayload(), { badSignature: true }));
    expect(response.status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });
});

describe("Calendly webhook: campaign comes only from verified evidence", () => {
  it("files the appointment under the matched lead's own campaign", async () => {
    seed({ leadgen_leads: [{ id: "lead-1", client_id: TEK, campaign_id: "tek-pest", email: "Pat@Pets.ca", status: "Interested", assigned_agent_id: HENRY, created_at: "2026-10-01" }] });
    const response = await POST(request("invitee.created", inviteePayload()));
    expect(response.status).toBe(200);
    expect(db.tables.leadgen_appointments).toHaveLength(1);
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ client_id: TEK, campaign_id: "tek-pest", lead_id: "lead-1", status: "Booked" });
    expect(db.tables.leadgen_leads[0]).toMatchObject({ status: "Appointment booked", campaign_id: "tek-pest", assigned_agent_id: HENRY });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("keeps the appointment unassigned (not guessed) when the prospect's leads disagree on campaign", async () => {
    seed({
      leadgen_leads: [
        { id: "l1", client_id: TEK, campaign_id: "tek-pest", email: "pat@pets.ca", status: "Interested", created_at: "2026-10-02" },
        { id: "l2", client_id: TEK, campaign_id: "tek-snow", email: "pat@pets.ca", status: "New", created_at: "2026-10-01" },
      ],
    });
    await POST(request("invitee.created", inviteePayload()));
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ client_id: TEK, campaign_id: null, lead_id: "l1" });
  });

  it("keeps it unassigned when there is no lead and the client runs several active campaigns", async () => {
    await POST(request("invitee.created", inviteePayload()));
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ client_id: TEK, campaign_id: null, lead_id: null });
    expect(db.tables.leadgen_appointments).toHaveLength(1); // retained, not dropped
  });

  it("uses the client's only active campaign when there is exactly one", async () => {
    seed({ leadgen_campaigns: [{ id: "tek-only", client_id: TEK, status: "active" }, { id: "tek-old", client_id: TEK, status: "paused" }] });
    await POST(request("invitee.created", inviteePayload()));
    expect(db.tables.leadgen_appointments[0]).toMatchObject({ campaign_id: "tek-only" });
  });

  it("never touches agent assignments or users", async () => {
    seed({ leadgen_leads: [{ id: "lead-1", client_id: TEK, campaign_id: "tek-pest", email: "pat@pets.ca", status: "New", created_at: "2026-10-01" }] });
    const before = JSON.stringify([db.tables.leadgen_campaign_agents, db.tables.leadgen_users]);
    await POST(request("invitee.created", inviteePayload()));
    expect(JSON.stringify([db.tables.leadgen_campaign_agents, db.tables.leadgen_users])).toBe(before);
    expect(writesTo("leadgen_campaign_agents")).toHaveLength(0);
    expect(writesTo("leadgen_users")).toHaveLength(0);
  });
});

describe("Calendly webhook: bookings that can't be filed are retained for Admin review", () => {
  it("queues a booking whose client can't be matched, with the full payload, and creates no appointment", async () => {
    const payload = inviteePayload({ scheduled_event: { start_time: "2026-10-20T15:00:00Z", event_type: "evt-unknown" } });
    seed({ leadgen_clients: [{ id: "c1", name: "A", slug: "a", active: true, calendly_event_type_uri: "x", booking_link: "https://calendly.com/a" }, { id: "c2", name: "B", slug: "b", active: true, calendly_event_type_uri: "y", booking_link: "https://calendly.com/b" }] });
    const response = await POST(request("invitee.created", payload));
    expect(await response.json()).toMatchObject({ received: true, matched: false, queued: true });
    expect(db.tables.leadgen_appointments).toHaveLength(0);
    expect(db.tables.leadgen_booking_review_queue).toHaveLength(1);
    expect(db.tables.leadgen_booking_review_queue[0]).toMatchObject({
      source: "calendly",
      reason: "client_not_matched",
      external_ref: payload.uri,
      contact_email: "pat@pets.ca",
      business_name: "Paws & Co",
      client_id: null,
    });
    expect(db.tables.leadgen_booking_review_queue[0].payload).toEqual(payload);
  });

  it("queues a booking with no start time against the matched client", async () => {
    await POST(request("invitee.created", inviteePayload({ scheduled_event: { event_type: "evt-tek" } })));
    expect(db.tables.leadgen_appointments).toHaveLength(0);
    expect(db.tables.leadgen_booking_review_queue[0]).toMatchObject({ reason: "missing_start_time", client_id: TEK });
  });

  it("queues a redelivered webhook only once", async () => {
    const payload = inviteePayload({ scheduled_event: { start_time: "2026-10-20T15:00:00Z", event_type: "evt-unknown" } });
    seed({ leadgen_clients: [{ id: "c1", name: "A", slug: "a", active: true, calendly_event_type_uri: "x", booking_link: null }] });
    await POST(request("invitee.created", payload));
    await POST(request("invitee.created", payload));
    expect(db.tables.leadgen_booking_review_queue).toHaveLength(1);
  });

  it("still answers 200 and drops nothing else if the queue table isn't available yet", async () => {
    seed({ leadgen_clients: [] }, { failTables: ["leadgen_booking_review_queue"] });
    const response = await POST(request("invitee.created", inviteePayload()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, matched: false, queued: false });
    expect(db.tables.leadgen_appointments).toHaveLength(0);
  });

  it("dismisses a queued booking when the prospect cancels it in Calendly", async () => {
    const payload = inviteePayload({ scheduled_event: { start_time: "2026-10-20T15:00:00Z", event_type: "evt-unknown" } });
    seed({ leadgen_clients: [] });
    await POST(request("invitee.created", payload));
    await POST(request("invitee.canceled", payload));
    expect(db.tables.leadgen_booking_review_queue[0]).toMatchObject({ status: "dismissed", resolution_note: "Cancelled in Calendly." });
    expect(db.tables.leadgen_booking_review_queue[0].payload).toEqual(payload); // payload kept
  });
});

describe("Calendly webhook: idempotency", () => {
  it("never creates or notifies twice for a redelivered booking", async () => {
    await POST(request("invitee.created", inviteePayload()));
    const second = await POST(request("invitee.created", inviteePayload()));
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect(db.tables.leadgen_appointments).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
