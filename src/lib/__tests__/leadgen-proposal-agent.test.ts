import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type Row } from "./fake-supabase";

// Agents PREPARE proposal requests for their own leads; only Admin approves and
// sends. Runs the real agent + admin actions and the real sendLeadgenEmail on an
// in-memory database; only Resend is faked.

vi.mock("server-only", () => ({}));

const ADMIN = { id: "admin-1", full_name: "Admin User", email: "info@winsalotcorp.com", role: "admin" };
const HENRY = { id: "79be9174-e168-4f0f-a7b8-7e97f662fc3d", full_name: "Henry Osuji", email: "henry@winsalotcorp.com", role: "agent" };
const GOODNESS = { id: "a8f77781-daed-4c5c-b8fa-09c27609ae14", full_name: "Goodness Ugbana", email: "goodness@winsalotcorp.com", role: "agent" };

let db = createFakeDb();
const requireAdmin = vi.fn();
const requireAgent = vi.fn();
const resendSend = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../leadgen-auth", () => ({ requireLeadgenAdmin: () => requireAdmin(), requireLeadgenAgent: () => requireAgent() }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => db.client }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../resend", () => ({ getResendClient: () => ({ emails: { send: (...args: unknown[]) => resendSend(...args) } }) }));

import { prepareProposalRequestAction } from "../../app/leadgen/agent/(dashboard)/leads/[id]/proposal-actions";
import { requestProposalAction } from "../../app/leadgen/admin/(dashboard)/leads/[id]/proposal-actions";
import { PROPOSAL_REQUIREMENTS_PLACEHOLDER } from "../leadgen-proposal";

function seed(extra: Record<string, Row[]> = {}) {
  db = createFakeDb(
    {
      leadgen_clients: [
        { id: "tek", name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true, contact_name: "Shahbaz Anjum", contact_email: "shahbaz.anjum@teknokraft.ca" },
        { id: "hid", name: "Hidebrandt Web Services", slug: "hidebrandt-web-services", active: true, contact_name: null, contact_email: "team@hidebrandt.ca" },
        { id: "off", name: "Old Client", slug: "old", active: false, contact_name: null, contact_email: "old@x.ca" },
      ],
      leadgen_leads: [
        { id: "lead-henry", client_id: "tek", campaign_id: "tek-c", assigned_agent_id: HENRY.id, business_name: "Boondock Pet Resort", status: "Interested", email: "info@boondock.com" },
        { id: "lead-goodness", client_id: "hid", campaign_id: "hid-c", assigned_agent_id: GOODNESS.id, business_name: "Prairie Pets", status: "Interested" },
        { id: "lead-off", client_id: "off", campaign_id: null, assigned_agent_id: HENRY.id, business_name: "Stale Co", status: "New" },
      ],
      leadgen_campaign_agents: [
        { campaign_id: "tek-c", agent_id: HENRY.id },
        { campaign_id: "hid-c", agent_id: GOODNESS.id },
      ],
      leadgen_followups: [{ id: "f1", lead_id: "lead-henry" }],
      leadgen_appointments: [{ id: "a1", lead_id: "lead-henry" }],
      leadgen_emails: [],
      leadgen_lead_proposals: [],
      leadgen_proposal_drafts: [],
      leadgen_lead_activities: [],
      ...extra,
    },
    { uniques: { leadgen_emails: ["request_key"], leadgen_lead_proposals: ["lead_id"], leadgen_proposal_drafts: ["lead_id"] } }
  );
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}
const draftForm = (over: Record<string, string> = {}) =>
  form({ subject: "Proposal Requested – Boondock Pet Resort | Teknokraft Canada Inc.", body: `Hello Teknokraft Team,\n\n${PROPOSAL_REQUIREMENTS_PLACEHOLDER}`, ...over });
const untouched = () => JSON.stringify({ leads: db.tables.leadgen_leads, followups: db.tables.leadgen_followups, appointments: db.tables.leadgen_appointments, assignments: db.tables.leadgen_campaign_agents });

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  requireAgent.mockResolvedValue(HENRY);
  resendSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });
  seed();
});

describe("prepareProposalRequestAction (agent)", () => {
  it("saves a draft for the agent's own lead - and sends NOTHING", async () => {
    const before = untouched();
    const result = await prepareProposalRequestAction("lead-henry", draftForm());
    expect(result.error).toBeUndefined();

    expect(resendSend).not.toHaveBeenCalled();
    expect(db.tables.leadgen_emails).toHaveLength(0);
    expect(db.tables.leadgen_lead_proposals).toHaveLength(0); // status stays Not Requested
    expect(db.tables.leadgen_proposal_drafts).toHaveLength(1);
    expect(db.tables.leadgen_proposal_drafts[0]).toMatchObject({ lead_id: "lead-henry", client_id: "tek", prepared_by: HENRY.id });
    expect(untouched()).toBe(before);
  });

  it("records the preparation in the lead's (internal) history", async () => {
    await prepareProposalRequestAction("lead-henry", draftForm());
    expect(db.tables.leadgen_lead_activities).toHaveLength(1);
    expect(db.tables.leadgen_lead_activities[0]).toMatchObject({ lead_id: "lead-henry", agent_id: HENRY.id, activity_type: "proposal_prepared" });
    expect(String(db.tables.leadgen_lead_activities[0].notes)).toMatch(/awaiting Admin approval/);
  });

  it("allows the [Insert …] placeholder in a draft (Admin completes it before sending)", async () => {
    expect((await prepareProposalRequestAction("lead-henry", draftForm())).error).toBeUndefined();
  });

  it("a second save replaces the one draft rather than adding another", async () => {
    await prepareProposalRequestAction("lead-henry", draftForm());
    await prepareProposalRequestAction("lead-henry", draftForm({ body: "Updated scope and budget." }));
    expect(db.tables.leadgen_proposal_drafts).toHaveLength(1);
    expect(db.tables.leadgen_proposal_drafts[0].body).toBe("Updated scope and budget.");
  });

  it("an agent cannot prepare a request for a lead assigned to someone else, or a lead that doesn't exist", async () => {
    requireAgent.mockResolvedValue(HENRY);
    expect((await prepareProposalRequestAction("lead-goodness", draftForm())).error).toMatch(/not found/i);
    expect((await prepareProposalRequestAction("nope", draftForm())).error).toMatch(/not found/i);
    requireAgent.mockResolvedValue(GOODNESS);
    expect((await prepareProposalRequestAction("lead-henry", draftForm())).error).toMatch(/not found/i);
    expect(db.tables.leadgen_proposal_drafts).toHaveLength(0);
    expect(db.tables.leadgen_lead_activities).toHaveLength(0);
  });

  it("refuses an inactive client and empty fields", async () => {
    expect((await prepareProposalRequestAction("lead-off", draftForm())).error).toMatch(/isn't an active client/);
    expect((await prepareProposalRequestAction("lead-henry", draftForm({ subject: "" }))).error).toBeTruthy();
    expect((await prepareProposalRequestAction("lead-henry", draftForm({ body: "  " }))).error).toBeTruthy();
    expect(db.tables.leadgen_proposal_drafts).toHaveLength(0);
  });

  it("leaves leads, follow-ups, appointments and every campaign assignment (Henry's and Goodness's) untouched", async () => {
    const before = untouched();
    await prepareProposalRequestAction("lead-henry", draftForm());
    requireAgent.mockResolvedValue(GOODNESS);
    await prepareProposalRequestAction("lead-goodness", draftForm({ subject: "Proposal Requested – Prairie Pets | Hidebrandt" }));
    expect(untouched()).toBe(before);
    expect(db.tables.leadgen_campaign_agents).toHaveLength(2);
  });
});

describe("Admin approval and send", () => {
  it("Admin sends to the CLIENT's contact email, and the agent's draft is cleared", async () => {
    await prepareProposalRequestAction("lead-henry", draftForm({ body: "Hello Teknokraft Team,\n\nFull redesign, budget $6k, 8 weeks." }));
    expect(db.tables.leadgen_proposal_drafts).toHaveLength(1);

    const result = await requestProposalAction(
      "lead-henry",
      form({ subject: "Proposal Requested – Boondock Pet Resort | Teknokraft Canada Inc.", body: "Hello Teknokraft Team,\n\nFull redesign, budget $6k, 8 weeks.", request_key: "approve-key-0000000001" })
    );
    expect(result.error).toBeUndefined();
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(resendSend.mock.calls[0][0].to).toBe("shahbaz.anjum@teknokraft.ca");
    expect(db.tables.leadgen_proposal_drafts).toHaveLength(0);
    expect(db.tables.leadgen_lead_proposals[0]).toMatchObject({ lead_id: "lead-henry", status: "proposal_requested", request_count: 1 });
    expect(db.tables.leadgen_lead_activities.map((a) => a.activity_type)).toEqual(["proposal_prepared", "proposal_requested"]);
  });

  it("a failed send keeps the agent's draft so Admin can retry", async () => {
    await prepareProposalRequestAction("lead-henry", draftForm({ body: "Hello Team,\n\nScope confirmed." }));
    resendSend.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await requestProposalAction("lead-henry", form({ subject: "S", body: "Hello Team,\n\nScope confirmed.", request_key: "approve-key-0000000002" }));
    expect(result.error).toBeTruthy();
    expect(db.tables.leadgen_proposal_drafts).toHaveLength(1);
  });

  it("an agent session can never reach the send action", async () => {
    requireAdmin.mockRejectedValue(new Error("redirect: not an administrator"));
    await expect(requestProposalAction("lead-henry", form({ subject: "S", body: "B", request_key: "approve-key-0000000003" }))).rejects.toThrow();
    expect(resendSend).not.toHaveBeenCalled();
  });
});
