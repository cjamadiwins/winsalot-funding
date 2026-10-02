import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked server-action tests for the admin "Email Client" lead notification.
// Dependencies are mocked so these exercise the action's own rules: admin-only,
// recipient resolved from the lead's client (never the form), timeline entry
// only after a successful send, and no side effects on the lead.

const requireLeadgenAdminMock = vi.fn();
vi.mock("@/lib/leadgen-auth", () => ({ requireLeadgenAdmin: () => requireLeadgenAdminMock() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sendLeadgenEmailMock = vi.fn();
vi.mock("@/lib/leadgen-email", () => ({
  sendLeadgenEmail: (...args: unknown[]) => sendLeadgenEmailMock(...args),
  buildLeadgenBookingEmailHtml: vi.fn(),
  buildLeadgenConsultationCtaEmail: vi.fn(),
}));
vi.mock("@/lib/dnc-suppression", () => ({ isEmailDncBlocked: vi.fn() }));

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

let sessionDb: ReturnType<typeof createMockSupabase>;
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: () => Promise.resolve(sessionDb) }));

import { sendClientLeadNotificationAction } from "@/app/leadgen/admin/(dashboard)/leads/[id]/actions";

const admin = { id: "admin-1", full_name: "Admin User", email: "admin@winsalotcorp.com" };
const lead = { id: "lead-1", client_id: "client-tek", campaign_id: "camp-1" };
const client = { id: "client-tek", name: "Teknokraft Canada Inc.", active: true, contact_name: "Shahbaz Anjum", contact_email: "shahbaz.anjum@teknokraft.ca" };

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const values = { notification_type: "proposal_requested", subject: "Interested Lead – Mak 7even Renovations – Proposal Requested", body: "Hi Teknokraft team,", ...overrides };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const touched = (table: string, method: string) => sessionDb.ops.filter((o) => o.table === table).flatMap((o) => o.calls).filter(([m]) => m === method);

beforeEach(() => {
  vi.clearAllMocks();
  requireLeadgenAdminMock.mockResolvedValue(admin);
  sendLeadgenEmailMock.mockResolvedValue({ emailId: "email-1" });
  sessionDb = createMockSupabase({ leadgen_leads: [{ data: lead }], leadgen_clients: [{ data: client }], leadgen_lead_activities: [{ data: null }] });
});

describe("sendClientLeadNotificationAction", () => {
  it("is Admin-only: a non-admin session is rejected before anything is read or sent", async () => {
    requireLeadgenAdminMock.mockRejectedValue(new Error("redirect"));
    await expect(sendClientLeadNotificationAction("lead-1", form())).rejects.toThrow();
    expect(sessionDb.from).not.toHaveBeenCalled();
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });

  it("sends to the lead's own client contact email and ignores any recipient in the form", async () => {
    const result = await sendClientLeadNotificationAction("lead-1", form({ to_email: "attacker@example.com" }));
    expect(result).toEqual({ emailId: "email-1" });
    const input = sendLeadgenEmailMock.mock.calls[0][1];
    expect(input).toMatchObject({
      clientId: "client-tek",
      leadId: "lead-1",
      campaignId: "camp-1",
      toEmail: "shahbaz.anjum@teknokraft.ca",
      toName: "Shahbaz Anjum",
      sentBy: "admin-1",
      notificationType: "proposal_requested",
    });
    expect(JSON.stringify(input)).not.toContain("attacker@example.com");
  });

  it("logs 'Client notified – Proposal Requested' on the lead timeline after a successful send", async () => {
    await sendClientLeadNotificationAction("lead-1", form());
    const [[, [row]]] = touched("leadgen_lead_activities", "insert") as [[string, [Record<string, string>]]];
    expect(row).toMatchObject({ lead_id: "lead-1", agent_id: "admin-1", activity_type: "client_notified" });
    expect(row.notes.split("\n")[0]).toBe("Client notified – Proposal Requested");
    expect(row.notes).toContain("shahbaz.anjum@teknokraft.ca");
  });

  it("does not change the lead or create an appointment/follow-up", async () => {
    await sendClientLeadNotificationAction("lead-1", form());
    expect(touched("leadgen_leads", "update")).toHaveLength(0);
    expect(touched("leadgen_leads", "insert")).toHaveLength(0);
    expect(sessionDb.ops.some((o) => o.table === "leadgen_appointments" || o.table === "leadgen_followups")).toBe(false);
    // The only writes are the (mocked) email send and the one timeline insert.
    expect(sessionDb.ops.flatMap((o) => o.calls.map(([m]) => `${o.table}.${m}`)).filter((c) => /\.(insert|update|upsert|delete)$/.test(c))).toEqual(["leadgen_lead_activities.insert"]);
  });

  it("surfaces a send failure, never records 'Client notified', and leaves the lead alone", async () => {
    sendLeadgenEmailMock.mockResolvedValue({ emailId: "email-failed", error: "Failed to send the email. Please try again." });
    const result = await sendClientLeadNotificationAction("lead-1", form());
    expect(result).toEqual({ emailId: "email-failed", error: "Failed to send the email. Please try again." });
    expect(touched("leadgen_lead_activities", "insert")).toHaveLength(0);
    expect(touched("leadgen_leads", "update")).toHaveLength(0);
  });

  it("warns (without re-prompting a resend) if only the timeline entry fails after a real send", async () => {
    sessionDb = createMockSupabase({ leadgen_leads: [{ data: lead }], leadgen_clients: [{ data: client }], leadgen_lead_activities: [{ error: { message: "x" } }] });
    const result = await sendClientLeadNotificationAction("lead-1", form());
    expect(result.error).toBeUndefined();
    expect(result.warning).toMatch(/Do not send it again/);
  });

  it.each([
    ["unknown lead", () => createMockSupabase({ leadgen_leads: [{ data: null }] }), /Lead not found/],
    ["inactive client", () => createMockSupabase({ leadgen_leads: [{ data: lead }], leadgen_clients: [{ data: { ...client, active: false } }] }), /isn't an active client/],
    ["client without a contact email", () => createMockSupabase({ leadgen_leads: [{ data: lead }], leadgen_clients: [{ data: { ...client, contact_email: null } }] }), /No contact email/],
  ])("rejects %s before sending", async (_label, makeDb, message) => {
    sessionDb = makeDb();
    const result = await sendClientLeadNotificationAction("lead-1", form());
    expect(result.error).toMatch(message);
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid type", { notification_type: "status_change" }, /notification type/],
    ["empty subject", { subject: "  " }, /subject/],
    ["empty body", { body: "" }, /body/],
  ])("validates %s", async (_label, override, message) => {
    const result = await sendClientLeadNotificationAction("lead-1", form(override));
    expect(result.error).toMatch(message);
    expect(sendLeadgenEmailMock).not.toHaveBeenCalled();
  });

  it("works the same for a different active client (generic, not Teknokraft-specific)", async () => {
    sessionDb = createMockSupabase({
      leadgen_leads: [{ data: { id: "lead-9", client_id: "client-hid", campaign_id: null } }],
      leadgen_clients: [{ data: { id: "client-hid", name: "Hidebrandt Web Services", active: true, contact_name: "Theodore", contact_email: "theodore@example.com" } }],
      leadgen_lead_activities: [{ data: null }],
    });
    await sendClientLeadNotificationAction("lead-9", form({ notification_type: "interested_lead" }));
    expect(sendLeadgenEmailMock.mock.calls[0][1]).toMatchObject({ clientId: "client-hid", leadId: "lead-9", toEmail: "theodore@example.com", notificationType: "interested_lead" });
  });
});
