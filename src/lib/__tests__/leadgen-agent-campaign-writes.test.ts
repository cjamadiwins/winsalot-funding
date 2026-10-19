import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./fake-supabase";
let db = createFakeDb();
const refresh = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => refresh(...args),
}));
vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: async () => db.client,
}));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../leadgen-auth", () => ({
  requireLeadgenAgent: async () => ({
    id: "goodness",
    email: "agent@example.com",
    full_name: "Goodness",
  }),
}));
vi.mock("../leadgen-appointment-notifications", () => ({
  notifyOfNewLeadgenAppointment: async () => undefined,
}));
vi.mock("../appointment-sms", () => ({
  isValidMobileNumber: () => false,
  sendImmediateAppointmentConfirmation: async () => undefined,
}));
vi.mock("../leadgen-appointment-reminders", () => ({
  zonedWallTimeToUtcMs: () => Date.UTC(2026, 10, 2, 15),
}));
vi.mock("../dnc-suppression", () => ({
  addOrUpdateDncSuppression: async () => ({}),
}));
import { createLeadgenCallLogAction } from "../../app/leadgen/agent/(dashboard)/call-log/actions";
import { createCampaignCallAction } from "../../app/leadgen/agent/(dashboard)/campaigns/actions";
import { bookAppointmentAction } from "../../app/leadgen/agent/(dashboard)/appointments/actions";
function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
beforeEach(() => {
  refresh.mockClear();
  db = createFakeDb({
    leadgen_users: [{ id: "goodness", current_campaign_id: "old" }],
    leadgen_clients: [
      { id: "tek", name: "Teknokraft", active: true, is_internal_test: false },
      { id: "hide", name: "Hidebrandt", active: true, is_internal_test: false },
    ],
    leadgen_campaigns: [
      { id: "roof", name: "Roofing", client_id: "tek", status: "active" },
      { id: "old", name: "Existing", client_id: "hide", status: "active" },
      {
        id: "unassigned",
        name: "Unassigned",
        client_id: "tek",
        status: "active",
      },
    ],
    leadgen_campaign_agents: [
      { campaign_id: "roof", agent_id: "goodness" },
      { campaign_id: "old", agent_id: "goodness" },
    ],
    leadgen_leads: [
      {
        id: "lead",
        client_id: "tek",
        campaign_id: "roof",
        assigned_agent_id: "goodness",
      },
      {
        id: "colleague",
        client_id: "tek",
        campaign_id: "roof",
        assigned_agent_id: "henry",
      },
    ],
  });
});
const call = (overrides = {}) =>
  form({
    business_name: "Roof Ltd",
    phone: "4165550101",
    outcome: "Interested",
    client_id: "tek",
    campaign_id: "roof",
    ...overrides,
  });
const appointment = (overrides = {}) =>
  form({
    business_name: "Roof Ltd",
    client_id: "tek",
    campaign_id: "roof",
    lead_id: "lead",
    appointment_date: "2026-11-02",
    appointment_time: "15:00",
    meeting_type: "Phone Call",
    contact_name: "Jane",
    email: "jane@roof.example",
    phone: "4165550101",
    appointment_notes: "Interested in SEO and website rebranding",
    ...overrides,
  });
describe("campaign-scoped calls", () => {
  it("saves the exact campaign and refreshes history and dashboard immediately", async () => {
    expect(await createLeadgenCallLogAction(call())).toEqual({});
    expect(db.tables.leadgen_call_logs[0]).toMatchObject({
      agent_id: "goodness",
      client_id: "tek",
      campaign_id: "roof",
      outcome: "Interested",
    });
    expect(refresh).toHaveBeenCalledWith("/leadgen/agent", "layout");
  });
  it("rejects mismatched, missing and unassigned campaigns without writes", async () => {
    for (const changes of [
      { campaign_id: "old" },
      { campaign_id: "" },
      { campaign_id: "unassigned" },
    ])
      expect(
        (await createLeadgenCallLogAction(call(changes))).error,
      ).toBeTruthy();
    expect(db.writes).toEqual([]);
  });
  it("binds the workspace campaign and refuses forged selections", async () => {
    expect(
      await createCampaignCallAction(
        "roof",
        call({ client_id: "hide", campaign_id: "old" }),
      ),
    ).toEqual({});
    expect(db.tables.leadgen_call_logs[0]).toMatchObject({
      client_id: "tek",
      campaign_id: "roof",
    });
    expect(
      (await createCampaignCallAction("unassigned", call())).error,
    ).toBeTruthy();
  });
});
describe("campaign-scoped appointment booking", () => {
  it("derives the campaign from the assigned lead and preserves contact and service interest", async () => {
    expect(
      await bookAppointmentAction(appointment({ campaign_id: "" })),
    ).toEqual({});
    expect(db.tables.leadgen_appointments[0]).toMatchObject({
      client_id: "tek",
      campaign_id: "roof",
      booking_agent_id: "goodness",
      contact_name: "Jane",
      email: "jane@roof.example",
      appointment_notes: "Interested in SEO and website rebranding",
    });
  });
  it("rejects a different client, different campaign, absent lead, and colleague lead", async () => {
    for (const changes of [
      { client_id: "hide" },
      { campaign_id: "old" },
      { lead_id: "missing" },
      { lead_id: "colleague" },
    ])
      expect(
        (await bookAppointmentAction(appointment(changes))).error,
      ).toBeTruthy();
    expect(db.writes).toEqual([]);
  });
  it("requires a valid assigned campaign for standalone appointments", async () => {
    expect(
      (
        await bookAppointmentAction(
          appointment({ lead_id: "", campaign_id: "unassigned" }),
        )
      ).error,
    ).toBeTruthy();
    expect(
      (
        await bookAppointmentAction(
          appointment({ lead_id: "", campaign_id: "" }),
        )
      ).error,
    ).toBeTruthy();
    expect(await bookAppointmentAction(appointment({ lead_id: "" }))).toEqual(
      {},
    );
  });
});
