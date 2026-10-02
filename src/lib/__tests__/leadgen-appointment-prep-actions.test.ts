import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked server-action tests for Client Appointment Preparation: Admin-only
// gating, "save -> email -> only then mark Sent" ordering, client isolation
// on feedback, and Viewed-only-after-Sent. Every dependency is mocked, so
// these exercise each action's own logic without a live Supabase/Resend.

const requireLeadgenAdminMock = vi.fn();
const requireLeadgenPortalClientMock = vi.fn();
vi.mock("@/lib/leadgen-auth", () => ({
  requireLeadgenAdmin: () => requireLeadgenAdminMock(),
  requireLeadgenPortalClient: () => requireLeadgenPortalClientMock(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sendLeadgenEmailMock = vi.fn();
vi.mock("@/lib/leadgen-email", () => ({
  sendLeadgenEmail: (...args: unknown[]) => sendLeadgenEmailMock(...args),
  leadgenButtonHtml: (url: string, label: string) => `<a href="${url}">${label}</a>`,
  textToSimpleHtml: (text: string) => `<div>${text}</div>`,
}));

type Response = { data?: unknown; error?: unknown };
type Op = { table: string; calls: [string, unknown[]][] };

function createMockSupabase(responses: Record<string, Response[]>) {
  const queues = Object.fromEntries(Object.entries(responses).map(([t, l]) => [t, [...l]]));
  const ops: Op[] = [];
  const from = vi.fn((table: string) => {
    const response = queues[table]?.shift() ?? { data: null, error: null };
    const resolved = { data: response.data ?? null, error: response.error ?? null };
    const op: Op = { table, calls: [] };
    ops.push(op);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "not", "is", "order", "limit", "insert", "update", "upsert", "delete"]) {
      chain[method] = vi.fn((...args: unknown[]) => {
        op.calls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolved));
    chain.single = vi.fn(() => Promise.resolve(resolved));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(resolved).then(resolve, reject);
    return chain;
  });
  return { from, ops };
}

let adminDb: ReturnType<typeof createMockSupabase>;
let sessionDb: ReturnType<typeof createMockSupabase>;
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => adminDb }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: () => Promise.resolve(sessionDb) }));

import { previewAppointmentBriefEmailAction, sendAppointmentBriefAction, saveAppointmentBriefAction, type BriefFormInput } from "@/app/leadgen/admin/(dashboard)/appointments/prep-actions";
import { submitAppointmentFeedbackAction } from "@/app/client/(portal)/appointments/actions";

const futureAppointment = {
  id: "appt-1",
  client_id: "client-1",
  campaign_id: null,
  lead_id: null,
  business_name: "Joe's Auto",
  appointment_date: "2099-01-01",
  appointment_time: "09:00",
  timezone: "America/Toronto",
  status: "Booked",
};
const pastAppointment = { ...futureAppointment, appointment_date: "2020-01-01" };

const completeForm: BriefFormInput = {
  why_interested: "Wants more inquiries",
  primary_opportunity: "Website redesign",
  main_interest: "",
  primary_need: "",
  interest_level: "High",
  recommended_objective: "Secure a proposal opportunity",
  appointment_summary: "",
  talking_points: "Ask what they dislike about their site",
  suggested_questions: "What would you improve?",
  recommended_next_step: "Send Proposal",
  next_step_note: "",
  admin_note: "INTERNAL: pushy prospect",
};
// What Admin reviewed/edited in the preview step.
const reviewedEmail = {
  subject: "Appointment Brief – Joe's Auto",
  body: "Hi Pat,\n\nHere is the preparation brief for your upcoming appointment with Joe's Auto.\n\nWants more inquiries.\n\nView Appointment Brief (sign in to the Winsalot Client Portal):\nhttps://leads.winsalotcorp.com/client/appointments/appt-1\n\nRegards,\nWinsalot Corp.",
};
const savedBrief = {
  id: "b1",
  appointment_id: "appt-1",
  client_id: "client-1",
  ...{ why_interested: "Wants more inquiries", primary_opportunity: "Website redesign", talking_points: ["x"], suggested_questions: ["q"] },
  prep_status: "brief_ready",
};
const clientRow = { id: "client-1", name: "Acme", contact_name: "Pat", contact_email: "pat@acme.test", appointment_notification_emails: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireLeadgenAdminMock.mockResolvedValue({ id: "admin-1", full_name: "Admin", email: "a@w.test" });
  requireLeadgenPortalClientMock.mockResolvedValue({ user: { id: "user-1" }, client: { id: "client-1" } });
  sendLeadgenEmailMock.mockResolvedValue({ emailId: "e1" });
});

describe("Admin permissions", () => {
  it("rejects a non-admin before touching any data", async () => {
    adminDb = createMockSupabase({});
    requireLeadgenAdminMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveAppointmentBriefAction("appt-1", completeForm)).rejects.toThrow("NEXT_REDIRECT");
    await expect(sendAppointmentBriefAction("appt-1", completeForm, reviewedEmail)).rejects.toThrow("NEXT_REDIRECT");
    await expect(previewAppointmentBriefEmailAction("appt-1", completeForm)).rejects.toThrow("NEXT_REDIRECT");
    expect(adminDb.from).not.toHaveBeenCalled();
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });
});

describe("sendAppointmentBriefAction", () => {
  function setup(emailResult: { emailId: string; error?: string }) {
    sendLeadgenEmailMock.mockResolvedValue(emailResult);
    adminDb = createMockSupabase({
      leadgen_appointments: [{ data: futureAppointment }],
      leadgen_appointment_briefs: [{ data: null }, { data: savedBrief }, { error: null }],
      leadgen_appointment_admin_notes: [{ error: null }],
      leadgen_clients: [{ data: clientRow }],
    });
  }

  it("saves, emails with an id-only portal link, then marks the brief Sent to Client", async () => {
    setup({ emailId: "e1" });
    const result = await sendAppointmentBriefAction("appt-1", completeForm, reviewedEmail);
    expect(result.error).toBeUndefined();
    expect(result.prepStatus).toBe("sent_to_client");

    const email = sendLeadgenEmailMock.mock.calls[0][1];
    expect(email.toEmail).toBe("pat@acme.test");
    // Client-level email: must not attach to the lead/appointment email status.
    expect(email.appointmentId).toBeNull();
    expect(email.leadId).toBeNull();
    expect(email.clientId).toBe("client-1");
    expect(email.clientVisible).toBe(true);
    expect(email.body).toContain("https://leads.winsalotcorp.com/client/appointments/appt-1");
    expect(email.body).not.toContain("INTERNAL");
    expect(email.html).toContain("View Appointment Brief");
    // The Admin-reviewed subject/body is what is sent.
    expect(email.subject).toBe("Appointment Brief – Joe's Auto");
    // Linked to the appointment through brief_appointment_id, not appointment_id.
    expect(email.briefAppointmentId).toBe("appt-1");

    const statusWrite = adminDb.ops.filter((o) => o.table === "leadgen_appointment_briefs").at(-1)!;
    const update = statusWrite.calls.find(([m]) => m === "update")![1][0] as Record<string, unknown>;
    expect(update.prep_status).toBe("sent_to_client");
    expect(update.viewed_at).toBeNull();
    // Appointment status/records are never written.
    expect(adminDb.ops.filter((o) => o.table === "leadgen_appointments").every((o) => o.calls.every(([m]) => m === "select" || m === "eq"))).toBe(true);
  });

  it("keeps the internal note out of the client brief row", async () => {
    setup({ emailId: "e1" });
    await sendAppointmentBriefAction("appt-1", completeForm, reviewedEmail);
    const briefUpsert = adminDb.ops.filter((o) => o.table === "leadgen_appointment_briefs").flatMap((o) => o.calls).find(([m]) => m === "upsert")![1][0] as Record<string, unknown>;
    expect(JSON.stringify(briefUpsert)).not.toContain("INTERNAL");
    const noteUpsert = adminDb.ops.find((o) => o.table === "leadgen_appointment_admin_notes")!.calls.find(([m]) => m === "upsert")![1][0] as Record<string, unknown>;
    expect(noteUpsert.prep_note).toBe("INTERNAL: pushy prospect");
  });

  it("does not change the status when delivery fails", async () => {
    setup({ emailId: "e1", error: "Failed to send the email. Please try again." });
    const result = await sendAppointmentBriefAction("appt-1", completeForm, reviewedEmail);
    expect(result.error).toMatch(/could not be delivered/);
    const statusUpdates = adminDb.ops.flatMap((o) => o.calls).filter(([m, a]) => m === "update" && (a[0] as { prep_status?: string }).prep_status === "sent_to_client");
    expect(statusUpdates).toHaveLength(0);
  });

  it("refuses to send an incomplete brief (saved, but not emailed)", async () => {
    adminDb = createMockSupabase({
      leadgen_appointments: [{ data: futureAppointment }],
      leadgen_appointment_briefs: [{ data: null }, { data: { ...savedBrief, why_interested: null, prep_status: "brief_not_prepared" } }],
      leadgen_appointment_admin_notes: [{ error: null }],
    });
    const result = await sendAppointmentBriefAction("appt-1", { ...completeForm, why_interested: "" }, reviewedEmail);
    expect(result.error).toMatch(/Your changes were saved/);
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });

  it("does not send a brief for an appointment that already took place", async () => {
    adminDb = createMockSupabase({ leadgen_appointments: [{ data: pastAppointment }] });
    const result = await sendAppointmentBriefAction("appt-1", completeForm, reviewedEmail);
    expect(result.error).toMatch(/already taken place/);
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });
});

const hidebrandt = { id: "client-hid", name: "Hidebrandt Web Services", contact_name: "Theodore", contact_email: "orstio@gmail.com", appointment_notification_emails: null };
const capitalAppointment = { ...futureAppointment, id: "appt-capital", client_id: "client-hid", lead_id: "lead-capital", business_name: "Capital Painters", appointment_date: "2099-10-05", appointment_time: "14:30:00" };
const capitalForm: BriefFormInput = {
  ...completeForm,
  why_interested: "Capital Painters wants more customer inquiries.",
  primary_opportunity: "Website Rebrand + SEO Lead Generation",
  main_interest: "Website Redesign / SEO",
  primary_need: "Generate more leads from search.",
  recommended_objective: "Discuss a website rebrand focused on conversion and SEO.",
  appointment_summary: "Capital Painters wants more customer inquiries.\n\nA key priority is to generate more leads from search.",
};
const capitalBrief = { ...savedBrief, appointment_id: "appt-capital", client_id: "client-hid", why_interested: "x", primary_opportunity: "y" };
const reviewedCapital = {
  subject: "Appointment Brief – Capital Painters",
  body: "Hi Theodore,\n\nHere is the preparation brief for your upcoming appointment with Capital Painters.\n\n(Admin edited this line.)\n\nView Appointment Brief (sign in to the Winsalot Client Portal):\nhttps://leads.winsalotcorp.com/client/appointments/appt-capital\n\nRegards,\nWinsalot Corp.",
};

describe("previewAppointmentBriefEmailAction (review step - read only)", () => {
  function previewDb(client: Record<string, unknown> = hidebrandt, appointment: Record<string, unknown> = capitalAppointment) {
    adminDb = createMockSupabase({
      leadgen_appointments: [{ data: appointment }],
      leadgen_clients: [{ data: client }],
      leadgen_leads: [{ data: { industry: "Painting Company" } }],
    });
  }
  const writes = () => adminDb.ops.flatMap((o) => o.calls.map(([m]) => `${o.table}.${m}`)).filter((c) => /\.(insert|update|upsert|delete)$/.test(c));

  it("resolves Hidebrandt and its recipient from the current client record, and writes/sends nothing", async () => {
    previewDb();
    const { preview, error } = await previewAppointmentBriefEmailAction("appt-capital", capitalForm);
    expect(error).toBeUndefined();
    expect(preview!.clientName).toBe("Hidebrandt Web Services");
    expect(preview!.recipients).toEqual([{ email: "orstio@gmail.com", name: "Theodore" }]);
    expect(preview!.prospect).toBe("Capital Painters");
    expect(preview!.when).toBe("Monday, October 5, 2099 at 2:30 PM (America/Toronto)");
    expect(preview!.subject).toBe("Appointment Brief – Capital Painters");
    expect(preview!.body.startsWith("Hi Theodore,")).toBe(true);
    expect(preview!.body).toContain("Key opportunity: Website Rebrand + SEO Lead Generation");
    expect(preview!.body).toContain("Industry: Painting Company");
    expect(writes()).toEqual([]);
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });

  it("follows the client record - a changed contact email is used, nothing is hardcoded", async () => {
    previewDb({ ...hidebrandt, contact_email: "new-contact@hidebrandt.test", contact_name: "Theo" });
    const { preview } = await previewAppointmentBriefEmailAction("appt-capital", capitalForm);
    expect(preview!.recipients).toEqual([{ email: "new-contact@hidebrandt.test", name: "Theo" }]);
    expect(preview!.body.startsWith("Hi Theo,")).toBe(true);
  });

  it("works the same for a different client and appointment (Teknokraft)", async () => {
    previewDb(
      { id: "client-tek", name: "Teknokraft Canada Inc.", contact_name: "Shahbaz Anjum", contact_email: "shahbaz.anjum@teknokraft.ca", appointment_notification_emails: null },
      { ...capitalAppointment, id: "appt-boondock", client_id: "client-tek", business_name: "Boondock Pet Resort" },
    );
    const { preview } = await previewAppointmentBriefEmailAction("appt-boondock", { ...capitalForm, why_interested: "Boondock wants more bookings.", appointment_summary: "Boondock wants more bookings." });
    expect(preview!.clientName).toBe("Teknokraft Canada Inc.");
    expect(preview!.recipients[0].email).toBe("shahbaz.anjum@teknokraft.ca");
    expect(preview!.subject).toBe("Appointment Brief – Boondock Pet Resort");
    expect(preview!.body).not.toContain("Capital Painters");
  });

  it("refuses an incomplete brief, a client with no email, and a past appointment", async () => {
    previewDb();
    expect((await previewAppointmentBriefEmailAction("appt-capital", { ...capitalForm, why_interested: "" })).error).toMatch(/Add why the prospect is interested/);
    previewDb({ ...hidebrandt, contact_email: null });
    adminDb = createMockSupabase({ leadgen_appointments: [{ data: capitalAppointment }], leadgen_clients: [{ data: { ...hidebrandt, contact_email: null } }], leadgen_users: [{ data: [] }] });
    expect((await previewAppointmentBriefEmailAction("appt-capital", capitalForm)).error).toMatch(/no email address on file/);
    adminDb = createMockSupabase({ leadgen_appointments: [{ data: { ...capitalAppointment, appointment_date: "2020-01-01" } }] });
    expect((await previewAppointmentBriefEmailAction("appt-capital", capitalForm)).error).toMatch(/already taken place/);
  });
});

describe("sendAppointmentBriefAction - logging, manual send, and isolation", () => {
  function sendDb(opts: { client?: Record<string, unknown>; activity?: Response } = {}) {
    adminDb = createMockSupabase({
      leadgen_appointments: [{ data: capitalAppointment }],
      leadgen_appointment_briefs: [{ data: null }, { data: capitalBrief }, { error: null }],
      leadgen_appointment_admin_notes: [{ error: null }],
      leadgen_clients: [{ data: opts.client ?? hidebrandt }],
      leadgen_lead_activities: [opts.activity ?? { data: null }],
    });
  }
  const calls = (table: string, method: string) => adminDb.ops.filter((o) => o.table === table).flatMap((o) => o.calls).filter(([m]) => m === method);

  it("sends the Admin-edited text to the client's current email and links it to the appointment", async () => {
    sendDb();
    const result = await sendAppointmentBriefAction("appt-capital", capitalForm, reviewedCapital);
    expect(result).toMatchObject({ prepStatus: "sent_to_client" });
    expect(sendLeadgenEmailMock).toHaveBeenCalledTimes(1);
    const email = sendLeadgenEmailMock.mock.calls[0][1];
    expect(email).toMatchObject({
      clientId: "client-hid",
      toEmail: "orstio@gmail.com",
      toName: "Theodore",
      subject: "Appointment Brief – Capital Painters",
      sentBy: "admin-1",
      briefAppointmentId: "appt-capital",
      appointmentId: null,
      leadId: null,
      templateKey: null,
    });
    expect(email.body).toContain("(Admin edited this line.)");
  });

  it("logs 'Appointment Brief Sent' on the lead's timeline only after delivery", async () => {
    sendDb();
    await sendAppointmentBriefAction("appt-capital", capitalForm, reviewedCapital);
    const [[, [row]]] = calls("leadgen_lead_activities", "insert") as [[string, [Record<string, string>]]];
    expect(row).toMatchObject({ lead_id: "lead-capital", agent_id: "admin-1", activity_type: "appointment_brief_sent" });
    expect(row.notes).toContain("orstio@gmail.com");
    expect(row.notes).toContain("Capital Painters");
  });

  it("records nothing as sent when delivery fails (the failed email row is kept by the shared sender)", async () => {
    sendDb();
    sendLeadgenEmailMock.mockResolvedValue({ emailId: "e-failed", error: "Failed to send the email. Please try again." });
    const result = await sendAppointmentBriefAction("appt-capital", capitalForm, reviewedCapital);
    expect(result.error).toMatch(/could not be delivered/);
    expect(calls("leadgen_lead_activities", "insert")).toHaveLength(0);
    expect(calls("leadgen_appointment_briefs", "update")).toHaveLength(0);
  });

  it("never touches the appointment, the lead, or the original SDR call history", async () => {
    sendDb();
    await sendAppointmentBriefAction("appt-capital", capitalForm, reviewedCapital);
    const writes = adminDb.ops.flatMap((o) => o.calls.map(([m]) => `${o.table}.${m}`)).filter((c) => /\.(insert|update|upsert|delete)$/.test(c));
    expect(writes.sort()).toEqual(["leadgen_appointment_admin_notes.upsert", "leadgen_appointment_briefs.update", "leadgen_appointment_briefs.upsert", "leadgen_lead_activities.insert"]);
    expect(adminDb.ops.some((o) => o.table === "leadgen_appointments" && o.calls.some(([m]) => m !== "select" && m !== "eq" && m !== "maybeSingle"))).toBe(false);
    // The only timeline write is one NEW entry; no existing activity is updated or deleted.
    expect(calls("leadgen_lead_activities", "update")).toHaveLength(0);
    expect(calls("leadgen_lead_activities", "delete")).toHaveLength(0);
  });

  it("is a separate communication: it never calls the appointment confirmation/reminder sender", async () => {
    sendDb();
    await sendAppointmentBriefAction("appt-capital", capitalForm, reviewedCapital);
    for (const [, input] of sendLeadgenEmailMock.mock.calls) {
      expect(input.appointmentId).toBeNull();
      expect(input.templateKey).toBeNull();
    }
  });

  it("emails every address on the client record and greets the team (not one person) when there are several", async () => {
    sendDb({ client: { ...hidebrandt, appointment_notification_emails: ["vikas@client.test", "praveen@client.test"], contact_name: "Vikas" } });
    await sendAppointmentBriefAction("appt-capital", capitalForm, reviewedCapital);
    expect(sendLeadgenEmailMock).toHaveBeenCalledTimes(2);
    expect(sendLeadgenEmailMock.mock.calls.map(([, i]) => i.toEmail)).toEqual(["vikas@client.test", "praveen@client.test"]);
    for (const [, input] of sendLeadgenEmailMock.mock.calls) expect(input.body.startsWith("Hi Hidebrandt Web Services team,")).toBe(true);
  });

  it("requires a subject and a body (manual, reviewed content)", async () => {
    sendDb();
    expect((await sendAppointmentBriefAction("appt-capital", capitalForm, { subject: " ", body: "x" })).error).toMatch(/subject/);
    sendDb();
    expect((await sendAppointmentBriefAction("appt-capital", capitalForm, { subject: "x", body: " " })).error).toMatch(/body/);
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });

  it("saving the brief never sends anything", async () => {
    adminDb = createMockSupabase({
      leadgen_appointments: [{ data: capitalAppointment }],
      leadgen_appointment_briefs: [{ data: null }, { data: capitalBrief }],
      leadgen_appointment_admin_notes: [{ error: null }],
    });
    const result = await saveAppointmentBriefAction("appt-capital", capitalForm);
    expect(result.message).toBe("Brief saved.");
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });
});

describe("submitAppointmentFeedbackAction (client isolation)", () => {
  const input = { outcome: "Great Opportunity", what_happened: "Good call", opportunity_quality: "Strong", fit_issues: ["Budget issue", "Not-a-real-reason"], future_notes: "More of these" };

  it("rejects an appointment that is not the signed-in client's, and never writes", async () => {
    sessionDb = createMockSupabase({ leadgen_appointments: [{ data: null }] });
    adminDb = createMockSupabase({});
    const result = await submitAppointmentFeedbackAction("someone-elses-appt", input);
    expect(result.error).toBe("Appointment not found.");
    const scope = sessionDb.ops[0].calls.filter(([m]) => m === "eq").map(([, a]) => a);
    expect(scope).toContainEqual(["client_id", "client-1"]);
    expect(adminDb.from).not.toHaveBeenCalled();
  });

  it("rejects feedback before the appointment has happened", async () => {
    sessionDb = createMockSupabase({ leadgen_appointments: [{ data: futureAppointment }] });
    adminDb = createMockSupabase({});
    const result = await submitAppointmentFeedbackAction("appt-1", input);
    expect(result.error).toMatch(/once the appointment has taken place/);
    expect(adminDb.from).not.toHaveBeenCalled();
  });

  it("saves validated feedback under the session's own client and user", async () => {
    sessionDb = createMockSupabase({ leadgen_appointments: [{ data: pastAppointment }] });
    adminDb = createMockSupabase({ leadgen_appointment_feedback: [{ error: null }] });
    const result = await submitAppointmentFeedbackAction("appt-1", input);
    expect(result.error).toBeUndefined();
    const row = adminDb.ops[0].calls.find(([m]) => m === "upsert")![1][0] as Record<string, unknown>;
    expect(row).toMatchObject({ appointment_id: "appt-1", client_id: "client-1", submitted_by: "user-1", outcome: "Great Opportunity", opportunity_quality: "Strong", fit_issues: ["Budget issue"] });
  });

  it("rejects an invalid outcome", async () => {
    sessionDb = createMockSupabase({ leadgen_appointments: [{ data: pastAppointment }] });
    adminDb = createMockSupabase({});
    const result = await submitAppointmentFeedbackAction("appt-1", { ...input, outcome: "Hacked" });
    expect(result.error).toBe("Select the appointment outcome.");
    expect(adminDb.from).not.toHaveBeenCalled();
  });
});
