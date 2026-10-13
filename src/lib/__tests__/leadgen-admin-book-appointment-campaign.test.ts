import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createFakeDb, type Row } from "./fake-supabase";

vi.mock("server-only", () => ({}));

let db = createFakeDb();
const ADMIN = "2101e587-c4fd-40af-914a-46db900ac711";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => db.client }));
vi.mock("../leadgen-auth", () => ({ requireLeadgenAdmin: async () => ({ id: ADMIN, full_name: "Admin", email: "info@winsalotcorp.com" }) }));
vi.mock("../leadgen-email", () => ({ sendLeadgenEmail: async () => undefined }));
vi.mock("../leadgen-appointment-notifications", () => ({ notifyOfNewLeadgenAppointment: async () => undefined }));
vi.mock("../appointment-sms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../appointment-sms")>()),
  sendImmediateAppointmentConfirmation: async () => undefined,
}));

import { checkAdminAppointmentCampaign, ADMIN_APPOINTMENT_CAMPAIGN_REQUIRED_MESSAGE } from "../leadgen-booking-campaign";
import { bookAppointmentAction } from "../../app/leadgen/admin/(dashboard)/appointments/actions";

const TEK = "cl-teknokraft";
const WEB6 = "cl-web6";
const campaigns = [
  { id: "tek-snow", name: "Teknokraft - Snow", status: "active" },
  { id: "tek-old", name: "Teknokraft - Old", status: "paused" },
  { id: "q3", name: "Q3 Growth Campaign", status: "active" },
];

describe("checkAdminAppointmentCampaign (pure rule)", () => {
  it("requires a campaign when the client has an active one to choose from", () => {
    expect(checkAdminAppointmentCampaign({ campaignId: "", clientCampaigns: campaigns })).toEqual({ ok: false, error: ADMIN_APPOINTMENT_CAMPAIGN_REQUIRED_MESSAGE });
    expect(checkAdminAppointmentCampaign({ campaignId: "   ", clientCampaigns: campaigns }).ok).toBe(false);
  });
  it("accepts one of the client's active campaigns", () => {
    expect(checkAdminAppointmentCampaign({ campaignId: "tek-snow", clientCampaigns: campaigns })).toEqual({ ok: true, campaignId: "tek-snow" });
  });
  it("rejects paused, hidden and other-client campaigns", () => {
    for (const id of ["tek-old", "q3", "someone-elses"]) expect(checkAdminAppointmentCampaign({ campaignId: id, clientCampaigns: campaigns }).ok).toBe(false);
  });
  it("allows no campaign only when the client has nothing active to pick", () => {
    expect(checkAdminAppointmentCampaign({ campaignId: "", clientCampaigns: [] })).toEqual({ ok: true, campaignId: null });
    expect(checkAdminAppointmentCampaign({ campaignId: "", clientCampaigns: [campaigns[1], campaigns[2]] })).toEqual({ ok: true, campaignId: null });
  });
});

function seed(extra: Record<string, Row[]> = {}) {
  db = createFakeDb({
    leadgen_clients: [
      { id: TEK, name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true, contact_email: null },
      { id: WEB6, name: "Web6 Solutions", slug: "web6-solutions", active: true, contact_email: null },
    ],
    leadgen_campaigns: [
      { id: "tek-snow", name: "Teknokraft - Snow", client_id: TEK, status: "active" },
      { id: "tek-pest", name: "Teknokraft - Pest", client_id: TEK, status: "active" },
      { id: "tek-old", name: "Teknokraft - Old", client_id: TEK, status: "paused" },
      { id: "web6-paused", name: "Web6 - Paused", client_id: WEB6, status: "paused" },
    ],
    leadgen_leads: [{ id: "lead-1", client_id: TEK, campaign_id: "tek-pest", status: "Interested", assigned_agent_id: "henry" }],
    leadgen_appointments: [{ id: "existing-1", client_id: TEK, campaign_id: null, status: "Booked", appointment_date: "2026-08-21" }],
    leadgen_lead_activities: [],
    leadgen_campaign_agents: [{ campaign_id: "tek-snow", agent_id: "henry" }],
    ...extra,
  });
}
beforeEach(() => seed());

function form(fields: Record<string, string>) {
  const data = new FormData();
  const all = { business_name: "Paws & Co", appointment_date: "2026-10-20", appointment_time: "10:00", meeting_type: "Phone Call", ...fields };
  for (const [key, value] of Object.entries(all)) data.set(key, value);
  return data;
}

describe("Admin Book Appointment action", () => {
  it("rejects a client with active campaigns when none is chosen, and saves nothing", async () => {
    const result = await bookAppointmentAction(form({ client_id: TEK, campaign_id: "" }));
    expect(result.error).toBe(ADMIN_APPOINTMENT_CAMPAIGN_REQUIRED_MESSAGE);
    expect(db.tables.leadgen_appointments).toHaveLength(1); // only the pre-existing one
    expect(db.writes).toHaveLength(0);
  });

  it("rejects a paused or another client's campaign", async () => {
    expect((await bookAppointmentAction(form({ client_id: TEK, campaign_id: "tek-old" }))).error).toBeTruthy();
    expect((await bookAppointmentAction(form({ client_id: WEB6, campaign_id: "tek-snow" }))).error).toBeTruthy();
    expect(db.writes).toHaveLength(0);
  });

  it("books under the chosen campaign and stamps it on the appointment", async () => {
    const result = await bookAppointmentAction(form({ client_id: TEK, campaign_id: "tek-snow" }));
    expect(result.error).toBeUndefined();
    expect(db.tables.leadgen_appointments).toHaveLength(2);
    expect(db.tables.leadgen_appointments[1]).toMatchObject({ client_id: TEK, campaign_id: "tek-snow", created_by: ADMIN });
  });

  it("still books for a client that has no active campaign, with no campaign", async () => {
    const result = await bookAppointmentAction(form({ client_id: WEB6, campaign_id: "" }));
    expect(result.error).toBeUndefined();
    expect(db.tables.leadgen_appointments[1]).toMatchObject({ client_id: WEB6, campaign_id: null });
  });

  it("leaves existing appointments, leads' campaigns and every assignment untouched", async () => {
    const before = JSON.stringify([db.tables.leadgen_appointments[0], db.tables.leadgen_campaign_agents]);
    await bookAppointmentAction(form({ client_id: TEK, campaign_id: "tek-pest", lead_id: "lead-1" }));
    expect(JSON.stringify([db.tables.leadgen_appointments[0], db.tables.leadgen_campaign_agents])).toBe(before);
    expect(db.tables.leadgen_leads[0]).toMatchObject({ campaign_id: "tek-pest", assigned_agent_id: "henry", status: "Appointment booked" });
    expect(db.writes.filter((w) => w.table === "leadgen_appointments").every((w) => w.op === "insert")).toBe(true);
    expect(db.writes.some((w) => w.table === "leadgen_campaign_agents" || w.table === "leadgen_users")).toBe(false);
  });
});

describe("Admin Book Appointment form", () => {
  const source = readFileSync("src/app/leadgen/admin/(dashboard)/appointments/AppointmentsListClient.tsx", "utf8");
  it("marks Campaign required when the client has active campaigns and drops 'No campaign'", () => {
    expect(source).toContain("required={campaignRequired}");
    expect(source).toContain("const campaignRequired = campaignsForAddForm.length > 0");
    expect(source).not.toContain("Campaign (optional)");
    expect(source).not.toMatch(/<option value="">No campaign<\/option>/);
  });
  it("only offers active campaigns", () => {
    expect(source).toContain('c.client_id === formClientId && c.status === "active"');
  });
});
