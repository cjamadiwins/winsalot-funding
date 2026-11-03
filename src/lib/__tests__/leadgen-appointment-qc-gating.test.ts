import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./fake-supabase";

// App-level checks for Appointment Quality Control: nothing client- or
// prospect-facing may go out while an appointment awaits approval; booking and
// approval actions enforce the same rules the database triggers do.

let db = createFakeDb();
const sendEmail = vi.fn<(...args: unknown[]) => Promise<{ emailId: string }>>(async () => ({ emailId: "email-1" }));
const sendSms = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
const claimSms = vi.fn<(...args: unknown[]) => Promise<{ outcome: string }>>(async () => ({ outcome: "sent" }));
const immediateSms = vi.fn<(...args: unknown[]) => Promise<{ outcome: string }>>(async () => ({ outcome: "sent" }));
const release = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
let awaiting = false;
let currentUser: Record<string, unknown> = { id: "admin-1", email: "admin@example.com", full_name: "Admin", role: "admin" };

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => db.client }));
vi.mock("../leadgen-email", () => ({ sendLeadgenEmail: (...args: unknown[]) => sendEmail(...args) }));
vi.mock("../twilio", () => ({ sendSmsToNumber: (...args: unknown[]) => sendSms(...args) }));
vi.mock("../site-url", () => ({ getSiteUrl: () => "https://crm.test" }));
vi.mock("../appointment-sms", () => ({
  claimAndSendAppointmentSms: (...args: unknown[]) => claimSms(...args),
  sendImmediateAppointmentConfirmation: (...args: unknown[]) => immediateSms(...args),
  buildClientAppointmentBookingSms: () => "sms body",
  formatSmsDateWithWeekdayLabel: () => "Mon",
  formatSmsTimeLabel: () => "2pm",
  isValidMobileNumber: () => false,
}));
vi.mock("../leadgen-appointment-reminders", () => ({ zonedWallTimeToUtcMs: () => Date.UTC(2030, 0, 1, 15) }));
vi.mock("../leadgen-auth", () => ({
  requireLeadgenAdmin: async () => currentUser,
  requireLeadgenAgent: async () => currentUser,
  requireLeadgenUser: async () => currentUser,
}));
vi.mock("../leadgen-appointment-qc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../leadgen-appointment-qc")>();
  return {
    ...actual,
    isAwaitingApproval: async () => awaiting,
    releaseHeldAppointmentNotifications: (...args: unknown[]) => release(...args),
  };
});

import { notifyOfNewLeadgenAppointment } from "../leadgen-appointment-notifications";
import { sendLeadgenAppointmentEmail } from "../leadgen-appointment-emails";
import { checkQualificationForBooking } from "../leadgen-appointment-qc";
import { bookAppointmentAction } from "../../app/leadgen/agent/(dashboard)/appointments/actions";
import { reviewAppointmentQualityAction, saveQualificationAction } from "../../app/leadgen/qualification-actions";
import { previewAppointmentBriefEmailAction, sendAppointmentBriefAction } from "../../app/leadgen/admin/(dashboard)/appointments/prep-actions";
import { AWAITING_APPROVAL_MESSAGE } from "../leadgen-qualification";

const client = {
  id: "hid",
  name: "Hidebrandt Web Services",
  contact_name: "Theodore",
  contact_email: "theo@client.test",
  appointment_notification_emails: ["theo@client.test", "ops@client.test"],
  sms_notification_number: "2045550100",
};
const appt = {
  id: "a1",
  lead_id: "lead-1",
  business_name: "JC Decorating",
  contact_name: "Jordan",
  phone: "2045550111",
  email: "jordan@prospect.test",
  appointment_date: "2030-01-01",
  appointment_time: "14:00:00",
  timezone: "America/Winnipeg",
  meeting_type: "Phone Call",
  meeting_link: null,
  appointment_notes: null,
};

const answers = {
  has_website: "yes",
  website_url: "https://jc.example",
  interested_in_new_or_redesign: "redesign",
  satisfied_with_site: "not_satisfied",
  needs_ecommerce: "no",
  interested_in_seo: "yes",
  challenges: "Outdated and not found on Google",
  understands_services: true,
  agreed_to_appointment: true,
  services_of_interest: ["redesign_rebranding"],
  intended_improvements: null,
  qualification_notes: null,
  lead_gen_only: false,
};

function seed(extra: Record<string, Record<string, unknown>[]> = {}) {
  db = createFakeDb({
    leadgen_clients: [{ ...client, active: true, is_internal_test: false }],
    leadgen_client_qualification_settings: [{ client_id: "hid", enabled: true, approved_services: ["new_website", "redesign_rebranding", "seo_visibility"], notes: null }],
    leadgen_leads: [{ id: "lead-1", client_id: "hid", campaign_id: "camp", assigned_agent_id: "agent-1", business_name: "JC Decorating" }],
    leadgen_campaigns: [{ id: "camp", client_id: "hid", status: "active" }],
    leadgen_campaign_agents: [{ campaign_id: "camp", agent_id: "agent-1" }],
    leadgen_appointments: [{ id: "a1", lead_id: "lead-1", client_id: "hid", campaign_id: "camp", status: "Booked", qc_status: "pending_review", admin_notified_at: null, assigned_specialist_id: "agent-1", booking_agent_id: "agent-1", business_name: "JC Decorating", appointment_date: "2030-01-01", appointment_time: "14:00:00", timezone: "America/Winnipeg", qualification_id: "q1" }],
    leadgen_lead_qualifications: [{ id: "q1", lead_id: "lead-1", client_id: "hid", campaign_id: "camp", agent_id: "agent-1", outcome: "qualified", category: "multiple_services", category_source: "agent_verified", updated_at: "2030-01-01", ...answers }],
    leadgen_users: [{ id: "admin-1", role: "admin", active: true, full_name: "Admin", email: "admin@example.com" }, { id: "agent-1", role: "agent", active: true, full_name: "Goodness", email: "g@example.com" }],
    leadgen_notifications: [],
    leadgen_lead_activities: [],
    ...extra,
  });
}

beforeEach(() => {
  sendEmail.mockClear();
  sendSms.mockClear();
  claimSms.mockClear();
  immediateSms.mockClear();
  release.mockClear();
  awaiting = false;
  currentUser = { id: "admin-1", email: "admin@example.com", full_name: "Admin", role: "admin" };
  seed();
});

describe("no client- or prospect-facing notification while an appointment awaits approval", () => {
  for (const status of ["pending_review", "needs_info", "rejected"]) {
    it(`holds everything when the appointment is ${status}, and only tells Admin`, async () => {
      db.tables.leadgen_appointments[0].qc_status = status;
      await notifyOfNewLeadgenAppointment(appt as never, client as never, "Goodness");
      const recipients = sendEmail.mock.calls.map((c) => (c[1] as { toEmail: string }).toEmail);
      expect(recipients).toEqual(["info@winsalotcorp.com"]);
      expect(sendEmail.mock.calls.every((c) => (c[1] as { clientVisible: boolean }).clientVisible === false)).toBe(true);
      expect(sendSms).not.toHaveBeenCalled(); // internal admin SMS
      expect(claimSms).not.toHaveBeenCalled(); // client SMS
      // The one-time "notified" claim is NOT consumed, so approval can still release everything.
      expect(db.tables.leadgen_appointments[0].admin_notified_at).toBeNull();
    });
  }

  it("sends the normal notifications once the appointment is approved", async () => {
    db.tables.leadgen_appointments[0].qc_status = "approved";
    await notifyOfNewLeadgenAppointment(appt as never, client as never, "Goodness");
    const recipients = sendEmail.mock.calls.map((c) => (c[1] as { toEmail: string }).toEmail);
    expect(recipients).toEqual(expect.arrayContaining(["info@winsalotcorp.com", "theo@client.test", "ops@client.test", "jordan@prospect.test"]));
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(claimSms).toHaveBeenCalledTimes(1);
    expect(db.tables.leadgen_appointments[0].admin_notified_at).not.toBeNull();
  });

  it("behaves exactly as before for clients that do not require review", async () => {
    db.tables.leadgen_appointments[0].qc_status = "not_required";
    await notifyOfNewLeadgenAppointment(appt as never, client as never, "Goodness");
    expect(sendEmail.mock.calls.length).toBeGreaterThanOrEqual(4);
    // ...and before the migration exists at all (no qc_status column).
    sendEmail.mockClear();
    delete db.tables.leadgen_appointments[0].qc_status;
    db.tables.leadgen_appointments[0].admin_notified_at = null;
    await notifyOfNewLeadgenAppointment(appt as never, client as never, "Goodness");
    expect(sendEmail.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("blocks manual resend / reminder emails to the prospect", async () => {
    const result = await sendLeadgenAppointmentEmail(db.client as never, "a1", { id: "admin-1", full_name: "Admin", email: "a@x.test" }, "resend_confirmation");
    expect(result.error).toBe(AWAITING_APPROVAL_MESSAGE);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("blocks the appointment brief preview and send", async () => {
    const input = { why_interested: "x", primary_opportunity: "y", main_interest: "", primary_need: "", interest_level: "", recommended_objective: "", appointment_summary: "", talking_points: "a", suggested_questions: "", recommended_next_step: "", next_step_note: "", admin_note: "", brief_template: "" };
    expect((await previewAppointmentBriefEmailAction("a1", input as never)).error).toBe(AWAITING_APPROVAL_MESSAGE);
    expect((await sendAppointmentBriefAction("a1", input as never, { subject: "s", body: "b" })).error).toBe(AWAITING_APPROVAL_MESSAGE);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("booking requires a valid qualification for gated clients", () => {
  const form = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ client_id: "hid", business_name: "JC Decorating", appointment_date: "2030-01-01", appointment_time: "14:00", meeting_type: "Phone Call", lead_id: "lead-1", ...extra })) f.set(k, v);
    return f;
  };

  beforeEach(() => {
    currentUser = { id: "agent-1", email: "g@example.com", full_name: "Goodness", role: "agent" };
    db.tables.leadgen_appointments = [];
  });

  it("refuses to book when no qualification has been recorded", async () => {
    db.tables.leadgen_lead_qualifications = [];
    const result = await bookAppointmentAction(form());
    expect(result.error).toMatch(/qualification/i);
    expect(db.tables.leadgen_appointments).toHaveLength(0);
  });

  it("refuses to book when the saved qualification is not marked Qualified", async () => {
    db.tables.leadgen_lead_qualifications[0].outcome = "requires_further_qualification";
    expect((await bookAppointmentAction(form())).error).toMatch(/not marked Qualified/);
    expect(db.tables.leadgen_appointments).toHaveLength(0);
  });

  it("refuses to book a lead-generation-only prospect or one with no approved service", async () => {
    db.tables.leadgen_lead_qualifications[0].lead_gen_only = true;
    expect((await bookAppointmentAction(form())).error).toMatch(/lead generation only/);
    db.tables.leadgen_lead_qualifications[0].lead_gen_only = false;
    db.tables.leadgen_lead_qualifications[0].services_of_interest = ["ecommerce"]; // not approved for this client
    expect((await bookAppointmentAction(form())).error).toMatch(/no longer meets/);
    expect(db.tables.leadgen_appointments).toHaveLength(0);
  });

  it("books with the qualification linked, tells the agent it is awaiting approval, and holds the prospect SMS", async () => {
    awaiting = true;
    const result = await bookAppointmentAction(form());
    expect(result.error).toBeUndefined();
    expect(result.message).toMatch(/Admin approval/);
    expect(db.tables.leadgen_appointments[0].qualification_id).toBe("q1");
    expect(immediateSms).not.toHaveBeenCalled();
  });

  it("does not interfere with clients that do not require qualification", async () => {
    db.tables.leadgen_client_qualification_settings[0].enabled = false;
    const gate = await checkQualificationForBooking(db.client as never, { clientId: "hid", leadId: "lead-1" });
    expect(gate).toEqual({ required: false });
    const result = await bookAppointmentAction(form());
    expect(result.error).toBeUndefined();
    expect(db.tables.leadgen_appointments[0]).not.toHaveProperty("qualification_id");
    expect(immediateSms).toHaveBeenCalledTimes(1);
  });

  it("works against a database without the qualification tables (migration not applied)", async () => {
    db = createFakeDb({ ...db.tables }, { failTables: ["leadgen_client_qualification_settings"] });
    expect(await checkQualificationForBooking(db.client as never, { clientId: "hid", leadId: "lead-1" })).toEqual({ required: false });
  });
});

describe("Admin decisions", () => {
  it("approves a pending appointment and releases the held notifications exactly once", async () => {
    const result = await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "approve" });
    expect(result.error).toBeUndefined();
    const row = db.tables.leadgen_appointments[0];
    expect(row.qc_status).toBe("approved");
    expect(row.qc_reviewed_by).toBe("admin-1");
    expect(release).toHaveBeenCalledTimes(1);
    expect(db.tables.leadgen_notifications.map((n) => n.user_id)).toEqual(["agent-1"]);
    // A second click cannot approve again or re-release.
    const again = await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "approve" });
    expect(again.error).toMatch(/already been decided/);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rejecting requires a reason, records it, and releases nothing", async () => {
    expect((await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "reject" })).error).toMatch(/reason/i);
    const ok = await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "reject", reasonOption: "Prospect wants lead generation only", detail: "asked for cold calling" });
    expect(ok.error).toBeUndefined();
    expect(db.tables.leadgen_appointments[0].qc_status).toBe("rejected");
    expect(db.tables.leadgen_appointments[0].qc_rejection_reason).toBe("Prospect wants lead generation only — asked for cold calling");
    expect(release).not.toHaveBeenCalled();
  });

  it("requesting more qualification needs feedback, sends the appointment back, and releases nothing", async () => {
    expect((await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "request_info" })).error).toMatch(/qualify further/);
    await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "request_info", feedback: "Confirm they want a website, not lead gen" });
    expect(db.tables.leadgen_appointments[0].qc_status).toBe("needs_info");
    expect(db.tables.leadgen_appointments[0].qc_admin_feedback).toBe("Confirm they want a website, not lead gen");
    expect(release).not.toHaveBeenCalled();
  });

  it("cannot approve an appointment without any qualification on file", async () => {
    db.tables.leadgen_appointments[0].qualification_id = null;
    db.tables.leadgen_lead_qualifications = [];
    expect((await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "approve" })).error).toMatch(/no qualification/i);
    expect(db.tables.leadgen_appointments[0].qc_status).toBe("pending_review");
  });

  it("does not touch appointments that never went through review", async () => {
    db.tables.leadgen_appointments[0].qc_status = "not_required";
    expect((await reviewAppointmentQualityAction({ appointmentId: "a1", decision: "approve" })).error).toMatch(/not part of the approval process/);
  });
});

describe("saving a qualification", () => {
  const save = (over: Record<string, unknown> = {}, outcome = "qualified") => saveQualificationAction({ leadId: "lead-1", answers: { ...answers, ...over }, outcome: outcome as never });

  beforeEach(() => {
    currentUser = { id: "agent-1", email: "g@example.com", full_name: "Goodness", role: "agent" };
    db.tables.leadgen_lead_qualifications = [];
  });

  it("saves a complete qualification as verified and classifies it", async () => {
    const result = await save();
    expect(result.error).toBeUndefined();
    const row = db.tables.leadgen_lead_qualifications[0];
    expect(row.outcome).toBe("qualified");
    expect(row.category).toBe("multiple_services");
    expect(row.category_source).toBe("agent_verified");
  });

  it("refuses 'Qualified' when answers are missing and keeps a draft preliminary", async () => {
    expect((await save({ challenges: "" })).error).toMatch(/required question/);
    expect(db.tables.leadgen_lead_qualifications).toHaveLength(0);
    const draft = await save({ challenges: "" }, "draft");
    expect(draft.error).toBeUndefined();
    expect(db.tables.leadgen_lead_qualifications[0].category_source).toBe("auto_preliminary");
    expect(db.tables.leadgen_lead_qualifications[0].outcome).toBe("draft");
  });

  it("never lets a lead-generation-only prospect be Qualified", async () => {
    expect((await save({ lead_gen_only: true })).error).toMatch(/lead generation only/);
    const notQualified = await save({ lead_gen_only: true }, "not_qualified");
    expect(notQualified.error).toBeUndefined();
    expect(db.tables.leadgen_lead_qualifications[0].category).toBe("not_qualified_lead_gen_only");
  });

  it("drops services the client has not approved instead of recording them", async () => {
    const result = await save({ services_of_interest: ["redesign_rebranding", "ecommerce"] });
    expect(result.error).toBeUndefined();
    expect(db.tables.leadgen_lead_qualifications[0].services_of_interest).toEqual(["redesign_rebranding"]);
    db.tables.leadgen_lead_qualifications = [];
    expect((await save({ services_of_interest: ["ecommerce"] })).error).toMatch(/service this client offers/);
  });

  it("only saves for leads assigned to the agent", async () => {
    db.tables.leadgen_leads[0].assigned_agent_id = "someone-else";
    expect((await save()).error).toMatch(/not assigned to you/);
  });

  it("refuses to run for a client with no qualification settings", async () => {
    db.tables.leadgen_client_qualification_settings = [];
    expect((await save()).error).toMatch(/not set up/);
  });
});
