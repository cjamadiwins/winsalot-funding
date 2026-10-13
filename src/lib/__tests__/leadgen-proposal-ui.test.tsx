import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createFakeDb, type Row } from "./fake-supabase";

vi.mock("server-only", () => ({}));

let portalDb = createFakeDb();
let portalClient = { id: "client-tek", name: "Teknokraft Canada Inc." };
vi.mock("../leadgen-auth", () => ({ requireLeadgenPortalClient: async () => ({ client: portalClient }) }));
vi.mock("../supabase-server", () => ({ createSupabaseServerClient: async () => portalDb.client }));

import ProposalRequestModal from "../../components/leadgen/ProposalRequestModal";
import ProposalPanel from "../../components/leadgen/ProposalPanel";
import ClientPortalProposalsPage from "../../app/client/(portal)/proposals/page";
import type { LeadProposalRow } from "../leadgen-proposal";
import type { LeadgenClientRow, LeadgenEmailRow, LeadgenLeadRow } from "../leadgen-types";

const client = { id: "client-tek", name: "Teknokraft Canada Inc.", slug: "teknokraft-canada", active: true, contact_name: "Shahbaz Anjum", contact_email: "shahbaz.anjum@teknokraft.ca" } as LeadgenClientRow;
const lead = {
  id: "lead-1",
  business_name: "Boondock Pet Resort",
  contact_name: "Marissa",
  industry: "Pet Care",
  email: "info@boondockspetresort.com",
  phone: "(905) 227-6336",
  website: "https://www.boondockspetresort.com/about.html",
  notes: "INTERNAL remark that must never appear",
  client_notes: null,
} as unknown as LeadgenLeadRow;
const noop = () => undefined;
const proposalRow = (overrides: Partial<LeadProposalRow> = {}): LeadProposalRow => ({
  id: "p1",
  lead_id: "lead-1",
  client_id: "client-tek",
  campaign_id: null,
  status: "proposal_requested",
  first_requested_at: "2026-10-13T16:00:00Z",
  last_requested_at: "2026-10-13T16:00:00Z",
  request_count: 1,
  last_request_email_id: "e1",
  status_updated_at: "2026-10-13T16:00:00Z",
  status_updated_by: "admin-1",
  created_at: "2026-10-13T16:00:00Z",
  updated_at: "2026-10-13T16:00:00Z",
  ...overrides,
});

describe("Request Proposal composer", () => {
  const html = renderToStaticMarkup(<ProposalRequestModal lead={lead} client={client} proposal={null} onClose={noop} onSend={async () => ({})} onSent={noop} />);

  it("shows the client (not the prospect) as the recipient, read-only", () => {
    expect(html).toContain("To (client)");
    expect(html).toContain("shahbaz.anjum@teknokraft.ca");
    expect(html).toContain("never to the prospect");
    expect(html).not.toMatch(/<input[^>]*name="to/i);
  });

  it("is prefilled with the specified subject and message, editable", () => {
    expect(html).toContain("Proposal Requested – Boondock Pet Resort | Teknokraft Canada Inc.");
    expect(html).toContain("Hello Teknokraft Team,");
    expect(html).toContain("Contact Person: Marissa");
    expect(html).toContain("Phone: +1 905-227-6336");
    expect(html).toContain("Website: https://www.boondockspetresort.com/about.html");
    expect(html).toContain("<textarea");
    expect(html).not.toContain("INTERNAL remark");
  });

  it("will not let Admin continue while the requirements placeholder is unresolved", () => {
    expect(html).toContain("Replace the bracketed requirements placeholder");
    const button = html.match(/<button[^>]*>Review &amp; Send<\/button>/)?.[0] ?? "";
    expect(button).toContain("disabled");
  });

  it("requires explicit acknowledgement before emailing the client a second time", () => {
    const again = renderToStaticMarkup(<ProposalRequestModal lead={lead} client={client} proposal={proposalRow({ request_count: 2 })} onClose={noop} onSend={async () => ({})} onSent={noop} />);
    expect(again).toContain("A proposal was already requested for this lead");
    expect(again).toContain("I understand Teknokraft Canada Inc. will be emailed again.");
    expect(again).toContain("2 requests sent");
  });

  it("explains a missing client contact email instead of allowing a send", () => {
    const noEmail = renderToStaticMarkup(<ProposalRequestModal lead={lead} client={{ ...client, contact_email: null }} proposal={null} onClose={noop} onSend={async () => ({})} onSent={noop} />);
    expect(noEmail).toContain("No contact email is saved for Teknokraft Canada Inc.");
  });

  it("guards against repeated clicks with a synchronous in-flight check and a per-send key", () => {
    const source = readFileSync("src/components/leadgen/ProposalRequestModal.tsx", "utf8");
    expect(source).toContain("inFlight.current");
    expect(source).toContain('formData.set("request_key", requestKey)');
    expect(source).toContain("setRequestKey(newRequestKey())"); // a fresh key after a failed attempt
  });
});

describe("agent 'Prepare Proposal Request' composer", () => {
  const html = renderToStaticMarkup(<ProposalRequestModal mode="prepare" lead={lead} client={client} proposal={null} onClose={noop} onSend={async () => ({})} onSent={noop} />);

  it("saves for Admin approval, emails nothing, and does not show the client's email address", () => {
    expect(html).toContain("Prepare Proposal Request");
    expect(html).toContain("Nothing is emailed");
    expect(html).toContain("Submit for Admin approval");
    expect(html).not.toContain("shahbaz.anjum@teknokraft.ca");
    expect(html).not.toContain("Review &amp; Send");
  });

  it("still starts from the specified subject and message, and allows saving with the placeholder", () => {
    expect(html).toContain("Proposal Requested – Boondock Pet Resort | Teknokraft Canada Inc.");
    expect(html).not.toContain("Replace the bracketed requirements placeholder");
  });

  it("Admin starts from the agent's prepared draft", () => {
    const draft = { id: "d1", lead_id: lead.id, client_id: client.id, subject: "Agent subject", body: "Agent-written scope and budget.", prepared_by: "a", prepared_at: "2026-10-13T16:00:00Z", updated_at: "2026-10-13T16:00:00Z" };
    const adminHtml = renderToStaticMarkup(<ProposalRequestModal lead={lead} client={client} proposal={null} preparedDraft={draft} onClose={noop} onSend={async () => ({})} onSent={noop} />);
    expect(adminHtml).toContain("Agent subject");
    expect(adminHtml).toContain("Agent-written scope and budget.");
    expect(adminHtml).toContain("Starting from the draft prepared by an agent");
  });
});

describe("Proposal panel", () => {
  it("shows an awaiting-approval notice for a prepared draft without implying anything was emailed", () => {
    const draft = { id: "d1", lead_id: "l", client_id: "c", subject: "S", body: "B", prepared_by: "a", prepared_at: "2026-10-13T16:00:00Z", updated_at: "2026-10-13T16:00:00Z" };
    const html = renderToStaticMarkup(<ProposalPanel proposal={null} draft={draft} clientName="Teknokraft Canada Inc." />);
    expect(html).toContain("Awaiting Admin approval");
    expect(html).toContain("Nothing has been emailed");
    expect(html).toContain("Not Requested");
  });

  const sentEmail = { status: "delivered", to_email: "shahbaz.anjum@teknokraft.ca", sent_at: "2026-10-13T16:00:05Z", delivered_at: "2026-10-13T16:00:09Z", bounced_at: null, failed_at: null, bounce_reason: null, failure_reason: null } as unknown as LeadgenEmailRow;

  it("shows 'Not Requested' for a lead with no request", () => {
    const html = renderToStaticMarkup(<ProposalPanel proposal={null} clientName="Teknokraft Canada Inc." />);
    expect(html).toContain("Not Requested");
    expect(html).toContain("No proposal has been requested from Teknokraft Canada Inc.");
  });

  it("shows the status, request count and delivery tracking, and Admin can change the status", () => {
    const html = renderToStaticMarkup(<ProposalPanel proposal={proposalRow({ request_count: 2 })} requestEmail={sentEmail} clientName="Teknokraft Canada Inc." onUpdateStatus={async () => ({})} />);
    expect(html).toContain("Proposal Requested");
    expect(html).toContain("2 requests");
    expect(html).toContain("Request email");
    expect(html).toContain("Delivered");
    expect(html).toContain("delivered");
    for (const label of ["Not Requested", "Proposal Requested", "In Preparation", "Proposal Sent", "Accepted", "Declined"]) expect(html).toContain(`>${label}</option>`);
    expect(html).toContain("never sends an email");
  });

  it("shows a bounce or failure reason", () => {
    const failed = { ...sentEmail, status: "failed", failed_at: "2026-10-13T16:00:06Z", failure_reason: "Resend rejected the address", delivered_at: null } as unknown as LeadgenEmailRow;
    const html = renderToStaticMarkup(<ProposalPanel proposal={proposalRow()} requestEmail={failed} clientName="Teknokraft Canada Inc." />);
    expect(html).toContain("Failed");
    expect(html).toContain("Resend rejected the address");
  });

  it("is read-only for agents: status only, no controls and no email details", () => {
    const html = renderToStaticMarkup(<ProposalPanel proposal={proposalRow({ status: "in_preparation" })} clientName="Teknokraft Canada Inc." />);
    expect(html).toContain("In Preparation");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Update status");
    expect(html).not.toContain("Request email");
  });
});

describe("client portal Proposals page", () => {
  function seedPortal(extra: Record<string, Row[]> = {}) {
    portalDb = createFakeDb({
      leadgen_lead_proposals: [
        { id: "p-tek-1", lead_id: "lead-a", client_id: "client-tek", status: "proposal_requested", first_requested_at: "2026-10-13T16:00:00Z", last_requested_at: "2026-10-13T16:00:00Z", request_count: 1, created_at: "2026-10-13T16:00:00Z" },
        { id: "p-tek-2", lead_id: "lead-b", client_id: "client-tek", status: "in_preparation", first_requested_at: "2026-10-10T16:00:00Z", last_requested_at: "2026-10-12T16:00:00Z", request_count: 2, created_at: "2026-10-10T16:00:00Z" },
        { id: "p-tek-0", lead_id: "lead-c", client_id: "client-tek", status: "not_requested", request_count: 0, created_at: "2026-10-09T16:00:00Z" },
        { id: "p-hid-1", lead_id: "lead-z", client_id: "client-hid", status: "proposal_sent", first_requested_at: "2026-10-11T16:00:00Z", last_requested_at: "2026-10-11T16:00:00Z", request_count: 1, created_at: "2026-10-11T16:00:00Z" },
      ],
      leadgen_leads: [
        { id: "lead-a", client_id: "client-tek", business_name: "Boondock Pet Resort", contact_name: "Marissa", notes: "INTERNAL agent note", assigned_agent_id: "agent-henry" },
        { id: "lead-b", client_id: "client-tek", business_name: "Mak 7even Renovations", contact_name: null, notes: "another internal note" },
        { id: "lead-c", client_id: "client-tek", business_name: "Reset Co", contact_name: null },
        { id: "lead-z", client_id: "client-hid", business_name: "Other Client's Prospect", contact_name: "Zed" },
      ],
      ...extra,
    });
  }

  it("lists only this client's requested proposals with client-friendly statuses", async () => {
    seedPortal();
    portalClient = { id: "client-tek", name: "Teknokraft Canada Inc." };
    const html = renderToStaticMarkup(await ClientPortalProposalsPage());
    expect(html).toContain("Boondock Pet Resort");
    expect(html).toContain("Mak 7even Renovations");
    expect(html).toContain("Requested");
    expect(html).toContain("In preparation");
    expect(html).toContain("Contact: Marissa");
    expect(html).not.toContain("Reset Co"); // 'Not Requested' is not shown to the client
  });

  it("never shows another client's prospects or any internal field", async () => {
    seedPortal();
    portalClient = { id: "client-tek", name: "Teknokraft Canada Inc." };
    const html = renderToStaticMarkup(await ClientPortalProposalsPage());
    expect(html).not.toContain("Other Client");
    expect(html).not.toContain("INTERNAL agent note");
    expect(html).not.toContain("another internal note");
    expect(html).not.toContain("agent-henry");
  });

  it("each client sees only its own, and an empty state when it has none", async () => {
    seedPortal();
    portalClient = { id: "client-hid", name: "Hidebrandt Web Services" };
    const hid = renderToStaticMarkup(await ClientPortalProposalsPage());
    expect(hid).toContain("Other Client&#x27;s Prospect");
    expect(hid).toContain("Proposal sent");
    expect(hid).not.toContain("Boondock");

    portalClient = { id: "client-none", name: "Nobody" };
    expect(renderToStaticMarkup(await ClientPortalProposalsPage())).toContain("No proposal requests yet.");
  });
});

describe("permissions wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("both server actions require an Admin before doing anything", () => {
    const source = read("src/app/leadgen/admin/(dashboard)/leads/[id]/proposal-actions.ts");
    expect(source.match(/const adminUser = await requireLeadgenAdmin\(\);/g)).toHaveLength(2);
    expect(source.indexOf("requireLeadgenAdmin()")).toBeLessThan(source.indexOf("createSupabaseServerClient()"));
  });

  it("the Request Proposal button needs Admin, the action and an active client", () => {
    expect(read("src/components/leadgen/LeadDetailClient.tsx")).toContain("isAdmin && actions.requestProposal && client.active");
  });

  it("only the Admin lead page supplies the actions; the agent page never does", () => {
    const adminPage = read("src/app/leadgen/admin/(dashboard)/leads/[id]/page.tsx");
    const agentPage = read("src/app/leadgen/agent/(dashboard)/leads/[id]/page.tsx");
    expect(adminPage).toContain("requestProposal: requestProposalAction");
    expect(adminPage).toContain("updateProposalStatus: updateProposalStatusAction");
    expect(agentPage).not.toMatch(/requestProposal|updateProposalStatus|admin\/\(dashboard\)/);
    // Agents may only PREPARE (never send): their page wires the prepare action alone.
    expect(agentPage).toContain("prepareProposal: prepareProposalRequestAction");
    expect(read("src/app/leadgen/agent/(dashboard)/leads/[id]/proposal-actions.ts")).not.toMatch(/sendLeadgenEmail|resend/i);
  });

  it("the agent action requires an agent and checks the lead is assigned to them", () => {
    const source = read("src/app/leadgen/agent/(dashboard)/leads/[id]/proposal-actions.ts");
    expect(source).toContain("await requireLeadgenAgent()");
    expect(source).toContain("lead.assigned_agent_id !== agent.id");
  });

  it("the Prepare button is for non-Admin users with the prepare action and an active client", () => {
    expect(read("src/components/leadgen/LeadDetailClient.tsx")).toContain("!isAdmin && actions.prepareProposal && client.active");
  });

  it("the proposals table holds no internal notes column", () => {
    const migration = read("supabase/migrations/20261013190000_leadgen_lead_proposals.sql");
    const table = migration.slice(migration.indexOf("create table if not exists public.leadgen_lead_proposals"), migration.indexOf("create index if not exists leadgen_lead_proposals_client_idx"));
    expect(table).not.toMatch(/\bnotes?\b/i);
  });
});
