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

import { sendAppointmentBriefAction, saveAppointmentBriefAction, type BriefFormInput } from "@/app/leadgen/admin/(dashboard)/appointments/prep-actions";
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
  interest_level: "High",
  recommended_objective: "Secure a proposal opportunity",
  appointment_summary: "",
  talking_points: "Ask what they dislike about their site",
  suggested_questions: "What would you improve?",
  recommended_next_step: "Send Proposal",
  next_step_note: "",
  admin_note: "INTERNAL: pushy prospect",
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
    await expect(sendAppointmentBriefAction("appt-1", completeForm)).rejects.toThrow("NEXT_REDIRECT");
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
    const result = await sendAppointmentBriefAction("appt-1", completeForm);
    expect(result.error).toBeUndefined();
    expect(result.prepStatus).toBe("sent_to_client");

    const email = sendLeadgenEmailMock.mock.calls[0][1];
    expect(email.toEmail).toBe("pat@acme.test");
    expect(email.appointmentId).toBe("appt-1");
    expect(email.body).toContain("https://leads.winsalotcorp.com/client/appointments/appt-1");
    expect(email.body).not.toContain("INTERNAL");
    expect(email.html).toContain("View Appointment Brief");

    const statusWrite = adminDb.ops.filter((o) => o.table === "leadgen_appointment_briefs").at(-1)!;
    const update = statusWrite.calls.find(([m]) => m === "update")![1][0] as Record<string, unknown>;
    expect(update.prep_status).toBe("sent_to_client");
    expect(update.viewed_at).toBeNull();
    // Appointment status/records are never written.
    expect(adminDb.ops.filter((o) => o.table === "leadgen_appointments").every((o) => o.calls.every(([m]) => m === "select" || m === "eq"))).toBe(true);
  });

  it("keeps the internal note out of the client brief row", async () => {
    setup({ emailId: "e1" });
    await sendAppointmentBriefAction("appt-1", completeForm);
    const briefUpsert = adminDb.ops.filter((o) => o.table === "leadgen_appointment_briefs").flatMap((o) => o.calls).find(([m]) => m === "upsert")![1][0] as Record<string, unknown>;
    expect(JSON.stringify(briefUpsert)).not.toContain("INTERNAL");
    const noteUpsert = adminDb.ops.find((o) => o.table === "leadgen_appointment_admin_notes")!.calls.find(([m]) => m === "upsert")![1][0] as Record<string, unknown>;
    expect(noteUpsert.prep_note).toBe("INTERNAL: pushy prospect");
  });

  it("does not change the status when delivery fails", async () => {
    setup({ emailId: "e1", error: "Failed to send the email. Please try again." });
    const result = await sendAppointmentBriefAction("appt-1", completeForm);
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
    const result = await sendAppointmentBriefAction("appt-1", { ...completeForm, why_interested: "" });
    expect(result.error).toMatch(/Your changes were saved/);
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });

  it("does not send a brief for an appointment that already took place", async () => {
    adminDb = createMockSupabase({ leadgen_appointments: [{ data: pastAppointment }] });
    const result = await sendAppointmentBriefAction("appt-1", completeForm);
    expect(result.error).toMatch(/already taken place/);
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
