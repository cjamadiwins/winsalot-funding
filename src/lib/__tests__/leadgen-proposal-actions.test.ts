import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type Row } from "./fake-supabase";

// Runs the REAL requestProposalAction / updateProposalStatusAction and the REAL
// sendLeadgenEmail against an in-memory database; only Resend is faked.

vi.mock("server-only", () => ({}));

const ADMIN = { id: "admin-1", full_name: "Admin User", email: "info@winsalotcorp.com" };
const HENRY = "79be9174-e168-4f0f-a7b8-7e97f662fc3d";
const GOODNESS = "a8f77781-daed-4c5c-b8fa-09c27609ae14";

let db = createFakeDb();
const requireAdmin = vi.fn();
const resendSend = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../leadgen-auth", () => ({ requireLeadgenAdmin: () => requireAdmin() }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => db.client }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../resend", () => ({ getResendClient: () => ({ emails: { send: (...args: unknown[]) => resendSend(...args) } }) }));

import { requestProposalAction, updateProposalStatusAction } from "../../app/leadgen/admin/(dashboard)/leads/[id]/proposal-actions";
import { PROPOSAL_REQUIREMENTS_PLACEHOLDER, buildProposalRequestDraft } from "../leadgen-proposal";
import type { LeadgenLeadRow } from "../leadgen-types";

const TEK = "client-teknokraft";
const HID = "client-hidebrandt";
const ACME = "client-acme";
const OFF = "client-inactive";
const NOMAIL = "client-no-email";

function seed(extra: Record<string, Row[]> = {}) {
  db = createFakeDb(
    {
      leadgen_clients: [
        { id: TEK, name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true, contact_name: "Shahbaz Anjum", contact_email: "shahbaz.anjum@teknokraft.ca" },
        { id: HID, name: "Hidebrandt Web Services", slug: "hidebrandt-web-services", active: true, contact_name: "Hide", contact_email: "team@hidebrandt.ca" },
        { id: ACME, name: "Acme Roofing Ltd.", slug: "acme-roofing", active: true, contact_name: null, contact_email: "hello@acmeroofing.ca" },
        { id: OFF, name: "Old Client", slug: "old-client", active: false, contact_name: null, contact_email: "old@client.ca" },
        { id: NOMAIL, name: "No Email Client", slug: "no-email", active: true, contact_name: null, contact_email: null },
      ],
      leadgen_leads: [
        { id: "lead-tek", client_id: TEK, campaign_id: "tek-pest", assigned_agent_id: HENRY, business_name: "Boondock Pet Resort", status: "Interested", email: "info@boondockspetresort.com", notes: "INTERNAL ONLY remark" },
        { id: "lead-hid", client_id: HID, campaign_id: "hid-win", assigned_agent_id: GOODNESS, business_name: "Prairie Pets", status: "Interested", email: "owner@prairiepets.ca" },
        { id: "lead-acme", client_id: ACME, campaign_id: null, assigned_agent_id: null, business_name: "Maple Homes", status: "New", email: "x@maplehomes.ca" },
        { id: "lead-off", client_id: OFF, campaign_id: null, assigned_agent_id: null, business_name: "Stale Co", status: "New" },
        { id: "lead-nomail", client_id: NOMAIL, campaign_id: null, assigned_agent_id: null, business_name: "Quiet Co", status: "New" },
      ],
      leadgen_followups: [{ id: "f1", lead_id: "lead-tek", agent_id: HENRY, status: "pending" }],
      leadgen_appointments: [{ id: "a1", lead_id: "lead-tek", client_id: TEK, campaign_id: "tek-pest", status: "Booked" }],
      leadgen_campaign_agents: [
        { campaign_id: "tek-pest", agent_id: HENRY },
        { campaign_id: "hid-win", agent_id: GOODNESS },
      ],
      leadgen_users: [
        { id: HENRY, role: "agent", current_campaign_id: "tek-pest" },
        { id: GOODNESS, role: "agent", current_campaign_id: "hid-win" },
      ],
      leadgen_emails: [],
      leadgen_lead_proposals: [],
      leadgen_lead_activities: [],
      ...extra,
    },
    { uniques: { leadgen_emails: ["request_key"], leadgen_lead_proposals: ["lead_id"] } }
  );
}

function completedDraft(lead: Row = db.tables.leadgen_leads[0], clientRow: Row = db.tables.leadgen_clients[0]) {
  const draft = buildProposalRequestDraft({ client: clientRow as never, lead: lead as unknown as LeadgenLeadRow });
  return { subject: draft.subject, body: draft.body.replace(PROPOSAL_REQUIREMENTS_PLACEHOLDER, "Full redesign of the existing site; budget $5k–$8k; launch within 8 weeks.") };
}

let keyCounter = 0;
const newKey = () => `test-request-key-${String(++keyCounter).padStart(8, "0")}-abcdef`;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
function requestForm(overrides: Record<string, string> = {}, base = completedDraft()) {
  return form({ subject: base.subject, body: base.body, request_key: newKey(), ...overrides });
}

const snapshot = () => JSON.stringify({ leads: db.tables.leadgen_leads, followups: db.tables.leadgen_followups, appointments: db.tables.leadgen_appointments, assignments: db.tables.leadgen_campaign_agents, users: db.tables.leadgen_users });

beforeEach(() => {
  vi.clearAllMocks();
  keyCounter = 0;
  requireAdmin.mockResolvedValue(ADMIN);
  resendSend.mockResolvedValue({ data: { id: "resend-msg-1" }, error: null });
  seed();
});

describe("requestProposalAction: sending", () => {
  it("emails the lead's CLIENT contact (never the prospect) and records the tracked email", async () => {
    const result = await requestProposalAction("lead-tek", requestForm({ to_email: "attacker@example.com", to: "attacker@example.com" }));
    expect(result.error).toBeUndefined();
    expect(result.emailId).toBeTruthy();

    expect(resendSend).toHaveBeenCalledTimes(1);
    const sent = resendSend.mock.calls[0][0];
    expect(sent.to).toBe("shahbaz.anjum@teknokraft.ca");
    expect(JSON.stringify(sent)).not.toContain("attacker@example.com");
    expect(sent.to).not.toBe("info@boondockspetresort.com"); // not the prospect
    expect(sent.subject).toBe("Proposal Requested – Boondock Pet Resort | Teknokraft Canada Inc.");
    expect(sent.text).toContain("Hello Teknokraft Team,");
    expect(sent.text).toContain("Business Name: Boondock Pet Resort");

    expect(db.tables.leadgen_emails).toHaveLength(1);
    expect(db.tables.leadgen_emails[0]).toMatchObject({
      client_id: TEK,
      lead_id: "lead-tek",
      campaign_id: "tek-pest",
      to_email: "shahbaz.anjum@teknokraft.ca",
      notification_type: "proposal_requested",
      client_visible: true,
      sent_by: "admin-1",
      status: "sent",
      resend_message_id: "resend-msg-1",
    });
    expect(db.tables.leadgen_emails[0].sent_at).toBeTruthy();
    expect(typeof db.tables.leadgen_emails[0].request_key).toBe("string");
  });

  it("never puts the lead's internal notes in the email", async () => {
    await requestProposalAction("lead-tek", requestForm());
    expect(JSON.stringify(resendSend.mock.calls[0][0])).not.toContain("INTERNAL ONLY");
    expect(JSON.stringify(db.tables.leadgen_emails[0])).not.toContain("INTERNAL ONLY");
  });

  it("sets the proposal to 'Proposal Requested' - never 'Proposal Sent' - and logs one internal timeline entry", async () => {
    await requestProposalAction("lead-tek", requestForm());
    expect(db.tables.leadgen_lead_proposals).toHaveLength(1);
    expect(db.tables.leadgen_lead_proposals[0]).toMatchObject({ lead_id: "lead-tek", client_id: TEK, campaign_id: "tek-pest", status: "proposal_requested", request_count: 1, status_updated_by: "admin-1" });
    expect(db.tables.leadgen_lead_proposals[0].last_request_email_id).toBe(db.tables.leadgen_emails[0].id);
    expect(db.tables.leadgen_lead_activities).toHaveLength(1);
    expect(db.tables.leadgen_lead_activities[0]).toMatchObject({ lead_id: "lead-tek", agent_id: "admin-1", activity_type: "proposal_requested" });
    expect(String(db.tables.leadgen_lead_activities[0].notes)).toContain("Proposal status: Proposal Requested");
  });

  it("changes nothing about the lead, its follow-ups, appointments, assignments or users", async () => {
    const before = snapshot();
    await requestProposalAction("lead-tek", requestForm());
    expect(snapshot()).toBe(before);
    expect(db.writes.map((w) => `${w.table}.${w.op}`).sort()).toEqual(
      ["leadgen_emails.insert", "leadgen_emails.update", "leadgen_lead_activities.insert", "leadgen_lead_proposals.insert", "leadgen_proposal_drafts.delete"].sort()
    );
  });

  it("works for every client, not just Teknokraft", async () => {
    for (const [leadId, to, subject] of [
      ["lead-hid", "team@hidebrandt.ca", "Proposal Requested – Prairie Pets | Hidebrandt Web Services"],
      ["lead-acme", "hello@acmeroofing.ca", "Proposal Requested – Maple Homes | Acme Roofing Ltd."],
    ] as const) {
      const lead = db.tables.leadgen_leads.find((l) => l.id === leadId)!;
      const clientRow = db.tables.leadgen_clients.find((c) => c.id === lead.client_id)!;
      resendSend.mockClear();
      const result = await requestProposalAction(leadId, requestForm({}, completedDraft(lead, clientRow)));
      expect(result.error).toBeUndefined();
      expect(resendSend.mock.calls[0][0]).toMatchObject({ to, subject });
    }
    expect(db.tables.leadgen_lead_proposals.map((p) => p.client_id).sort()).toEqual([ACME, HID]);
  });
});

describe("requestProposalAction: confirmation, editing and validation", () => {
  it("sends the message as edited by the Admin", async () => {
    await requestProposalAction("lead-tek", requestForm({ subject: "Edited subject", body: "Hello Team,\n\nPlease prepare a proposal. Budget confirmed at $6,500." }));
    expect(resendSend.mock.calls[0][0]).toMatchObject({ subject: "Edited subject" });
    expect(resendSend.mock.calls[0][0].text).toContain("Budget confirmed at $6,500.");
  });

  it("refuses to send while the [Insert …] requirements placeholder is still in the message", async () => {
    const draft = buildProposalRequestDraft({ client: db.tables.leadgen_clients[0] as never, lead: db.tables.leadgen_leads[0] as unknown as LeadgenLeadRow });
    const result = await requestProposalAction("lead-tek", form({ subject: draft.subject, body: draft.body, request_key: newKey() }));
    expect(result.error).toMatch(/placeholder/);
    expect(resendSend).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });

  it("rejects empty fields and a missing or malformed send key without sending", async () => {
    const cases: Record<string, string>[] = [{ subject: "" }, { body: " " }, { request_key: "" }, { request_key: "short" }, { request_key: "has spaces in it, not allowed!!" }];
    for (const overrides of cases) {
      const result = await requestProposalAction("lead-tek", requestForm(overrides));
      expect(result.error).toBeTruthy();
    }
    expect(resendSend).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });

  it("refuses an unknown lead, an inactive client and a client without a usable contact email", async () => {
    expect((await requestProposalAction("nope", requestForm())).error).toMatch(/Lead not found/);
    expect((await requestProposalAction("lead-off", requestForm())).error).toMatch(/isn't an active client/);
    expect((await requestProposalAction("lead-nomail", requestForm())).error).toMatch(/No contact email/);
    seed();
    (db.tables.leadgen_clients[0] as Row).contact_email = "not-an-email";
    expect((await requestProposalAction("lead-tek", requestForm())).error).toMatch(/isn't a valid address/);
    expect(resendSend).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });
});

describe("requestProposalAction: Admin only", () => {
  it("is rejected before anything is read, sent or written for a non-admin session", async () => {
    requireAdmin.mockRejectedValue(new Error("redirect"));
    await expect(requestProposalAction("lead-tek", requestForm())).rejects.toThrow();
    await expect(updateProposalStatusAction("lead-tek", "proposal_sent")).rejects.toThrow();
    expect(resendSend).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
  });
});

describe("requestProposalAction: duplicate-send protection", () => {
  it("a repeated click with the same key sends once and records once", async () => {
    const data = requestForm();
    const first = await requestProposalAction("lead-tek", data);
    const second = await requestProposalAction("lead-tek", data);
    expect(first.duplicate).toBeUndefined();
    expect(second).toMatchObject({ duplicate: true, emailId: first.emailId });
    expect(second.error).toBeUndefined();
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(db.tables.leadgen_emails).toHaveLength(1);
    expect(db.tables.leadgen_lead_proposals[0].request_count).toBe(1);
    expect(db.tables.leadgen_lead_activities).toHaveLength(1);
  });

  it("two simultaneous submissions with the same key still send once", async () => {
    const data = requestForm();
    const [a, b] = await Promise.all([requestProposalAction("lead-tek", data), requestProposalAction("lead-tek", data)]);
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1);
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(db.tables.leadgen_emails).toHaveLength(1);
    expect(db.tables.leadgen_lead_proposals[0].request_count).toBe(1);
  });

  it("a deliberate second request (new key) is a real second request", async () => {
    await requestProposalAction("lead-tek", requestForm());
    await requestProposalAction("lead-tek", requestForm());
    expect(resendSend).toHaveBeenCalledTimes(2);
    expect(db.tables.leadgen_emails).toHaveLength(2);
    expect(db.tables.leadgen_lead_proposals).toHaveLength(1);
    expect(db.tables.leadgen_lead_proposals[0]).toMatchObject({ request_count: 2, status: "proposal_requested" });
  });
});

describe("requestProposalAction: failures and delivery tracking", () => {
  it("a failed send keeps a 'failed' email record with the reason and timestamp, and changes no proposal state", async () => {
    resendSend.mockResolvedValue({ data: null, error: { message: "Resend rejected the address" } });
    const result = await requestProposalAction("lead-tek", requestForm());
    expect(result.error).toBe("Failed to send the email. Please try again.");
    expect(db.tables.leadgen_emails[0]).toMatchObject({ status: "failed", failure_reason: "Resend rejected the address" });
    expect(db.tables.leadgen_emails[0].failed_at).toBeTruthy();
    expect(db.tables.leadgen_lead_proposals).toHaveLength(0);
    expect(db.tables.leadgen_lead_activities).toHaveLength(0);
  });

  it("a thrown Resend error is also recorded as failed, and a retry with a new key then succeeds", async () => {
    resendSend.mockRejectedValueOnce(new Error("network down"));
    const failed = await requestProposalAction("lead-tek", requestForm());
    expect(failed.error).toBeTruthy();
    expect(db.tables.leadgen_emails[0]).toMatchObject({ status: "failed", failure_reason: "network down" });

    const retried = await requestProposalAction("lead-tek", requestForm());
    expect(retried.error).toBeUndefined();
    expect(db.tables.leadgen_emails.map((e) => e.status)).toEqual(["failed", "sent"]);
    expect(db.tables.leadgen_lead_proposals[0]).toMatchObject({ status: "proposal_requested", request_count: 1 });
  });

  it("warns - without inviting a resend - if only the proposal bookkeeping fails after a real send", async () => {
    db = createFakeDb(
      { ...Object.fromEntries(Object.entries(db.tables)), leadgen_emails: [], leadgen_lead_proposals: [] },
      { uniques: { leadgen_emails: ["request_key"] }, failTables: ["leadgen_lead_proposals"] }
    );
    const result = await requestProposalAction("lead-tek", requestForm());
    expect(result.error).toBeUndefined();
    expect(result.warning).toMatch(/Do not send it again/);
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(db.tables.leadgen_emails[0].status).toBe("sent");
  });
});

describe("proposal status progression", () => {
  it("a request after 'In Preparation' or 'Proposal Sent' never regresses the status", async () => {
    for (const status of ["in_preparation", "proposal_sent", "accepted"]) {
      seed({ leadgen_lead_proposals: [{ id: "p1", lead_id: "lead-tek", client_id: TEK, campaign_id: "tek-pest", status, request_count: 1, first_requested_at: "2026-10-01T00:00:00Z", status_updated_at: "2026-10-01T00:00:00Z" }] });
      await requestProposalAction("lead-tek", requestForm());
      expect(db.tables.leadgen_lead_proposals[0]).toMatchObject({ status, request_count: 2 });
    }
  });

  it("a new request after 'Declined' or 'Not Requested' starts again at 'Proposal Requested'", async () => {
    for (const status of ["declined", "not_requested"]) {
      seed({ leadgen_lead_proposals: [{ id: "p1", lead_id: "lead-tek", client_id: TEK, campaign_id: "tek-pest", status, request_count: 1 }] });
      await requestProposalAction("lead-tek", requestForm());
      expect(db.tables.leadgen_lead_proposals[0]).toMatchObject({ status: "proposal_requested", request_count: 2 });
    }
  });
});

describe("updateProposalStatusAction", () => {
  it("Admin sets each status by hand, logs it internally, and never sends an email", async () => {
    await requestProposalAction("lead-tek", requestForm());
    resendSend.mockClear();
    const emailsBefore = db.tables.leadgen_emails.length;
    for (const status of ["in_preparation", "proposal_sent", "accepted", "declined"]) {
      expect(await updateProposalStatusAction("lead-tek", status)).toEqual({});
      expect(db.tables.leadgen_lead_proposals[0].status).toBe(status);
    }
    expect(resendSend).not.toHaveBeenCalled();
    expect(db.tables.leadgen_emails).toHaveLength(emailsBefore);
    const changes = db.tables.leadgen_lead_activities.filter((a) => a.activity_type === "proposal_status_changed");
    expect(changes).toHaveLength(4);
    expect(String(changes[1].notes)).toContain("Proposal status changed from In Preparation to Proposal Sent by Admin User (Admin). No email was sent.");
  });

  it("'Proposal Sent' exists only because the Admin chose it", async () => {
    await requestProposalAction("lead-tek", requestForm());
    expect(db.tables.leadgen_lead_proposals[0].status).toBe("proposal_requested");
    await updateProposalStatusAction("lead-tek", "proposal_sent");
    expect(db.tables.leadgen_lead_proposals[0].status).toBe("proposal_sent");
  });

  it("creates the row on first use, ignores 'Not Requested' for a lead with none, and rejects bad values", async () => {
    expect(await updateProposalStatusAction("lead-hid", "not_requested")).toEqual({});
    expect(db.tables.leadgen_lead_proposals).toHaveLength(0);
    expect(await updateProposalStatusAction("lead-hid", "in_preparation")).toEqual({});
    expect(db.tables.leadgen_lead_proposals[0]).toMatchObject({ lead_id: "lead-hid", client_id: HID, status: "in_preparation", request_count: 0 });
    expect((await updateProposalStatusAction("lead-hid", "sent_to_prospect")).error).toBeTruthy();
    expect((await updateProposalStatusAction("missing", "accepted")).error).toMatch(/Lead not found/);
    expect(await updateProposalStatusAction("lead-hid", "in_preparation")).toEqual({}); // no-op, no extra activity
    expect(db.tables.leadgen_lead_activities).toHaveLength(1);
  });

  it("changes nothing else on the lead, follow-ups, appointments or assignments", async () => {
    const before = snapshot();
    await updateProposalStatusAction("lead-tek", "in_preparation");
    expect(snapshot()).toBe(before);
  });
});
