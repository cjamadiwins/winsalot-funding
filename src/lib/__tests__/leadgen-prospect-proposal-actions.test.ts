import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./fake-supabase";

// Prepare / send actions for the Teknokraft prospect proposal, with email
// sending mocked: nothing here can reach a real address.

let db = createFakeDb();
let currentAdmin: Record<string, unknown> | "reject" = { id: "admin-1", email: "info@winsalotcorp.com", full_name: "Winsalot Corp.", role: "admin" };
const sendEmail = vi.fn<(...args: unknown[]) => Promise<{ emailId: string; error?: string }>>(async () => ({ emailId: "email-1" }));
let dncBlocked = false;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => db.client }));
vi.mock("../leadgen-auth", () => ({
  requireLeadgenAdmin: async () => {
    if (currentAdmin === "reject") throw new Error("redirect: not an admin");
    return currentAdmin;
  },
}));
vi.mock("../dnc-suppression", () => ({ isEmailDncBlocked: async () => dncBlocked }));
vi.mock("../leadgen-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../leadgen-email")>();
  return { ...actual, sendLeadgenEmail: (...args: unknown[]) => sendEmail(...args) };
});

import { prepareProspectProposalAction, sendProspectProposalAction } from "../../app/leadgen/admin/(dashboard)/leads/[id]/proposal-prospect-actions";

const LEAD = "lead-ilv";
const TEK = { id: "tek", name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true, booking_link: "https://leads.winsalotcorp.com/book/teknokraft-canada", services_info_link: "https://www.teknokraft.ca" };

function seed(over: { lead?: Record<string, unknown>; client?: Record<string, unknown> } = {}) {
  db = createFakeDb({
    leadgen_clients: [{ ...TEK, ...(over.client ?? {}) }, { id: "hid", name: "Hidebrandt Web Services", slug: "hidebrandt-web-services", active: true, booking_link: null, services_info_link: null }],
    leadgen_client_qualification_settings: [{ client_id: "tek", enabled: true, approved_services: ["new_website", "redesign_rebranding", "seo_visibility", "digital_marketing"], notes: null }],
    leadgen_leads: [
      { id: LEAD, client_id: "tek", campaign_id: "camp", business_name: "ILV Plumbing Services", contact_name: "ilias", city: "Winnipeg", province: "MB", industry: "Plumbing", website: null, email: "ilias@ilvplumbing.com", phone: "+12045107030", status: "New", last_contacted_at: null, assigned_agent_id: null, ...(over.lead ?? {}) },
    ],
    call_list_leads: [{ id: "cl1", phone: "+12045107030", website: "https://ilvplumbing.com/", promoted_leadgen_lead_id: null }],
    leadgen_call_logs: [{ id: "log1", phone: "+12045107030", outcome: "Interested", notes: "Interested — interested but want us to send an email to him." }],
    leadgen_lead_activities: [{ id: "a-old", lead_id: LEAD, activity_type: "teknokraft_intro_sent", notes: "Teknokraft Canada Inc. intro email sent." }],
    leadgen_emails: [{ id: "e-old", lead_id: LEAD, subject: "Website & Digital Solutions for ILV Plumbing Services", status: "sent" }],
    leadgen_appointments: [],
    leadgen_prospect_proposals: [],
  });
}

beforeEach(() => {
  currentAdmin = { id: "admin-1", email: "info@winsalotcorp.com", full_name: "Winsalot Corp.", role: "admin" };
  dncBlocked = false;
  sendEmail.mockClear();
  sendEmail.mockResolvedValue({ emailId: "email-1" });
  seed();
});

describe("preparing the draft", () => {
  it("saves a personalized draft on the lead and sends nothing", async () => {
    const leadBefore = JSON.stringify(db.tables.leadgen_leads[0]);
    const result = await prepareProspectProposalAction(LEAD);
    expect(result.error).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();

    const rows = db.tables.leadgen_prospect_proposals;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lead_id: LEAD, client_id: "tek", campaign_id: "camp", status: "draft", email_to: "ilias@ilvplumbing.com", attachment_filename: "Teknokraft-Proposal-ILV-Plumbing-Services.pdf", prepared_by: "admin-1" });
    expect(rows[0].email_subject).toBe("Proposal for ILV Plumbing Services from Teknokraft Canada Inc.");
    expect(String(rows[0].email_body).startsWith("Hi Ilias,")).toBe(true);

    // The website came from the call list the lead was imported from; the facts from the logged call.
    const content = rows[0].content as { preparedFor: { website: string }; whatWeKnow: string[] };
    expect(content.preparedFor.website).toBe("ilvplumbing.com");
    expect(content.whatWeKnow).toContain("You spoke with our team and asked us to send information by email.");

    // Nothing existing was changed; the only additions are the draft and one internal note.
    expect(JSON.stringify(db.tables.leadgen_leads[0])).toBe(leadBefore);
    expect(db.tables.leadgen_emails).toHaveLength(1);
    const notes = db.tables.leadgen_lead_activities.filter((a) => a.activity_type === "note");
    expect(notes).toHaveLength(1);
    expect(String(notes[0].notes)).toMatch(/Not sent; awaiting Admin review/);
    expect(db.tables.leadgen_lead_activities.find((a) => a.id === "a-old")).toBeDefined();
    expect(db.tables.leadgen_appointments).toHaveLength(0);
  });

  it("preparing again refreshes the same draft instead of adding another", async () => {
    await prepareProspectProposalAction(LEAD);
    await prepareProspectProposalAction(LEAD);
    expect(db.tables.leadgen_prospect_proposals).toHaveLength(1);
  });

  it("does not assume a website: with none on file it says so", async () => {
    db.tables.call_list_leads = [];
    await prepareProspectProposalAction(LEAD);
    const content = db.tables.leadgen_prospect_proposals[0].content as { whatWeKnow: string[]; preparedFor: { website: string | null } };
    expect(content.preparedFor.website).toBeNull();
    expect(content.whatWeKnow.join(" ")).toMatch(/Website: not confirmed/);
  });

  it("only works for Teknokraft leads, needs an email, and is Admin-only", async () => {
    seed({ lead: { client_id: "hid" } });
    expect((await prepareProspectProposalAction(LEAD)).error).toMatch(/Teknokraft/);
    seed({ lead: { email: null } });
    expect((await prepareProspectProposalAction(LEAD)).error).toMatch(/no email address/);
    seed({ lead: { email: "not-an-email" } });
    expect((await prepareProspectProposalAction(LEAD)).error).toMatch(/not valid/);
    seed();
    currentAdmin = "reject";
    await expect(prepareProspectProposalAction(LEAD)).rejects.toThrow();
    expect(db.tables.leadgen_prospect_proposals).toHaveLength(0);
  });

  it("refuses when the client has no approved services configured", async () => {
    db.tables.leadgen_client_qualification_settings = [];
    expect((await prepareProspectProposalAction(LEAD)).error).toMatch(/approved services/);
  });
});

describe("sending the reviewed draft", () => {
  async function prepared() {
    await prepareProspectProposalAction(LEAD);
    return db.tables.leadgen_prospect_proposals[0].id as string;
  }

  it("emails the saved PDF once, to the draft's recipient, and records it without touching the lead", async () => {
    const id = await prepared();
    const leadBefore = JSON.stringify(db.tables.leadgen_leads[0]);
    const result = await sendProspectProposalAction(LEAD, id);
    expect(result.error).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const input = sendEmail.mock.calls[0][1] as { toEmail: string; subject: string; attachments: { filename: string; content: Buffer }[]; requestKey: string; clientVisible: boolean; sentBy: string; html: string; templateKey: string; leadId: string };
    expect(input).toMatchObject({ toEmail: "ilias@ilvplumbing.com", subject: "Proposal for ILV Plumbing Services from Teknokraft Canada Inc.", requestKey: `prospect-proposal:${id}`, clientVisible: false, sentBy: "admin-1", templateKey: "teknokraft_proposal", leadId: LEAD });
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments[0].filename).toBe("Teknokraft-Proposal-ILV-Plumbing-Services.pdf");
    expect(input.attachments[0].content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(input.html).toContain("https://leads.winsalotcorp.com/book/teknokraft-canada");

    expect(db.tables.leadgen_prospect_proposals[0]).toMatchObject({ status: "sent", sent_by: "admin-1", sent_email_id: "email-1" });
    expect(db.tables.leadgen_lead_activities.some((a) => /Proposal emailed to ilias@ilvplumbing\.com with PDF attached/.test(String(a.notes)))).toBe(true);
    // Lead status, last-contact date and appointments are untouched.
    expect(JSON.stringify(db.tables.leadgen_leads[0])).toBe(leadBefore);
    expect(db.tables.leadgen_appointments).toHaveLength(0);
  });

  it("a second send is refused and nothing more goes out", async () => {
    const id = await prepared();
    await sendProspectProposalAction(LEAD, id);
    expect((await sendProspectProposalAction(LEAD, id)).error).toMatch(/already been sent/);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("is blocked for a Do Not Contact address and when the lead's email changed after review", async () => {
    const id = await prepared();
    dncBlocked = true;
    expect((await sendProspectProposalAction(LEAD, id)).error).toMatch(/Do Not Contact/);
    dncBlocked = false;
    db.tables.leadgen_leads[0].email = "someone-else@example.com";
    expect((await sendProspectProposalAction(LEAD, id)).error).toMatch(/email address changed/);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.tables.leadgen_prospect_proposals[0].status).toBe("draft");
  });

  it("a failed or duplicate send leaves the proposal a draft", async () => {
    const id = await prepared();
    sendEmail.mockResolvedValueOnce({ emailId: "", error: "This email was already submitted. It has not been sent again." });
    expect((await sendProspectProposalAction(LEAD, id)).error).toMatch(/already submitted/);
    expect(db.tables.leadgen_prospect_proposals[0].status).toBe("draft");
  });

  it("only an Admin can send", async () => {
    const id = await prepared();
    currentAdmin = "reject";
    await expect(sendProspectProposalAction(LEAD, id)).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
