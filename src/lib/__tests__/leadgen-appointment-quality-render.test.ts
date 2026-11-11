import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Server-renders the new screens with realistic data (no browser, no database)
// to catch runtime errors and wrong content, separately for each client.

vi.mock("../../app/leadgen/qualification-actions", () => ({
  saveQualificationAction: async () => ({}),
  resubmitAppointmentForApprovalAction: async () => ({}),
  reviewAppointmentQualityAction: async () => ({}),
  reviewLegacyFlagAction: async () => ({}),
  saveQualificationSettingsAction: async () => ({}),
}));

import AppointmentQualityClient from "../../app/leadgen/admin/(dashboard)/appointment-quality/AppointmentQualityClient";
import QualificationPanel from "../../components/leadgen/QualificationPanel";
import type { AppointmentQualityData, QueueItem } from "../leadgen-appointment-quality-data";
import { EMPTY_ANSWERS } from "../leadgen-qualification";

const HID = ["new_website", "redesign_rebranding", "ecommerce", "seo_visibility", "human_search_optimization"];
const TEK = ["new_website", "redesign_rebranding", "seo_visibility"];

const qualification = {
  ...EMPTY_ANSWERS,
  id: "q1",
  lead_id: "lead-1",
  client_id: "hid",
  campaign_id: "camp",
  agent_id: "goodness",
  has_website: "yes" as const,
  website_url: "https://jc.example",
  interested_in_new_or_redesign: "redesign" as const,
  satisfied_with_site: "not_satisfied" as const,
  needs_ecommerce: "no" as const,
  interested_in_seo: "yes" as const,
  challenges: "Outdated and not found on Google",
  understands_services: true,
  agreed_to_appointment: true,
  services_of_interest: ["redesign_rebranding", "seo_visibility"],
  category: "multiple_services" as const,
  category_source: "agent_verified" as const,
  outcome: "qualified" as const,
  submitted_at: "2030-01-01T00:00:00Z",
  updated_at: "2030-01-01T00:00:00Z",
};

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: "a1",
  clientId: "hid",
  clientName: "Hidebrandt Web Services",
  businessName: "JC Decorating",
  contactName: "Jordan",
  appointmentDate: "2030-01-10",
  appointmentTime: "14:30:00",
  timezone: "America/Winnipeg",
  agentName: "Goodness Ugbana",
  qcStatus: "pending_review",
  submittedAt: "2030-01-05T12:00:00Z",
  adminFeedback: null,
  rejectionReason: null,
  reviewedAt: null,
  leadId: "lead-1",
  qualification,
  approvedServices: HID,
  blockers: [],
  ...over,
});

const emptyMetrics = { contacted: 0, qualified: 0, leadGenOnly: 0, submitted: 0, approved: 0, rejected: 0, needsInfo: 0, pending: 0, completed: 0, converted: 0, rejectionReasons: {} };

const data: AppointmentQualityData = {
  migrationMissing: false,
  queue: [
    item({}),
    item({ id: "a2", businessName: "Hiveforge Construction", qualification: null, blockers: ["No qualification on file. Request more qualification from the agent."] }),
    item({ id: "a3", clientId: "tek", clientName: "Teknokraft Canada Inc.", businessName: "SureGreen Landscaping", agentName: "Henry Osuji", qcStatus: "needs_info", adminFeedback: "Confirm they want a website", approvedServices: TEK }),
  ],
  recent: [item({ id: "a4", businessName: "Capital Painters", qcStatus: "rejected", rejectionReason: "Prospect wants lead generation only — asked about cold calling" }), item({ id: "a5", businessName: "Acme Plumbing", qcStatus: "approved" })],
  legacy: [
    { appointmentId: "l1", clientName: "Hidebrandt Web Services", businessName: "Hiveforge Construction Ltd", appointmentDate: "2026-11-03", status: "Booked", agentName: "Goodness Ugbana", reason: "Prospect interest appears to be lead generation / cold calling, not website services.", reviewStatus: "open", adminNote: null, notes: "Hassan is interested in lead generation" },
    { appointmentId: "l2", clientName: "Teknokraft Canada Inc.", businessName: "Handyman", appointmentDate: "2026-10-23", status: "Booked", agentName: "Henry Osuji", reason: "No documented interest in website-related services (new site, redesign, e-commerce, SEO).", reviewStatus: "reviewed_ok", adminNote: "Fine", notes: null },
  ],
  metrics: [
    { clientId: "hid", clientName: "Hidebrandt Web Services", totals: { ...emptyMetrics, contacted: 40, qualified: 6, submitted: 5, approved: 3, rejected: 1, pending: 1, completed: 1, converted: 1, rejectionReasons: { "Prospect wants lead generation only": 1 } }, agents: [{ agentId: "g", agentName: "Goodness Ugbana", metrics: { ...emptyMetrics, contacted: 40, qualified: 6, submitted: 5, approved: 3, rejected: 1, pending: 1 } }] },
    { clientId: "tek", clientName: "Teknokraft Canada Inc.", totals: { ...emptyMetrics, contacted: 25, qualified: 2, submitted: 2, approved: 2 }, agents: [{ agentId: "h", agentName: "Henry Osuji", metrics: { ...emptyMetrics, contacted: 25, qualified: 2, submitted: 2, approved: 2 } }] },
  ],
  settings: [
    { clientId: "hid", clientName: "Hidebrandt Web Services", enabled: true, approvedServices: HID, notes: null, configured: true },
    { clientId: "tek", clientName: "Teknokraft Canada Inc.", enabled: true, approvedServices: TEK, notes: null, configured: true },
    { clientId: "brent", clientName: "Brent's Essentials", enabled: false, approvedServices: [], notes: null, configured: false },
  ],
};

const render = (d: AppointmentQualityData, highlight: string | null = null) => renderToStaticMarkup(createElement(AppointmentQualityClient, { data: d, highlight }));

describe("Admin Appointment Quality dashboard", () => {
  const html = render(data, "a1");

  it("lists appointments awaiting review with the answers, per client", () => {
    expect(html).toContain("Appointments awaiting review");
    expect(html).toContain("JC Decorating");
    expect(html).toContain("Hiveforge Construction");
    expect(html).toContain("SureGreen Landscaping");
    expect(html).toContain("Hidebrandt Web Services");
    expect(html).toContain("Teknokraft Canada Inc.");
    expect(html).toContain("Outdated and not found on Google"); // an answer
    expect(html).toContain("Does the business currently have a website?");
    expect(html).toContain("You asked: Confirm they want a website"); // needs_info shows Admin's own request
  });

  it("offers approve / reject / request-more only where it makes sense, and blocks approving an unqualified one", () => {
    expect(html).toContain("Approve and release notifications");
    expect(html).toContain("Request more qualification");
    expect(html).toContain("Reject appointment");
    expect(html).toContain("It cannot be approved until these are resolved");
    expect(html).toContain("No qualification on file");
    // The approve button for the appointment with blockers is disabled; the clean one is not.
    const approveButtons = html.match(/<button[^>]*>Approve and release notifications<\/button>/g) ?? [];
    expect(approveButtons).toHaveLength(2); // the two pending (the needs_info one has none)
    expect(approveButtons.filter((b) => b.includes('disabled=""'))).toHaveLength(1);
  });

  it("shows summary counts, decisions with reasons, and the legacy review list", () => {
    expect(html).toContain("Awaiting your approval");
    expect(html).toContain("Sent back to agents");
    expect(html).toContain("Older appointments to review"); // one open of two
    expect(html).toContain("Prospect wants lead generation only — asked about cold calling");
    expect(html).toContain("Older appointments flagged for review");
    expect(html).toContain("lead generation / cold calling, not website services");
    expect(html).toContain("Needs review");
    expect(html).toContain("Reviewed - fine");
  });

  it("reports metrics separately for each client with per-agent rows and rejection reasons", () => {
    const idxH = html.indexOf("Hidebrandt Web Services total");
    const idxT = html.indexOf("Teknokraft Canada Inc. total");
    expect(idxH).toBeGreaterThan(-1);
    expect(idxT).toBeGreaterThan(idxH);
    expect(html).toContain("Goodness Ugbana");
    expect(html).toContain("Henry Osuji");
    expect(html).toContain("Prospect wants lead generation only (1)");
    expect(html).toContain("75%"); // 3 approved / 4 decided for Hidebrandt
    expect(html).toContain("100%"); // Teknokraft 2/2
  });

  it("shows each client's own service settings, never one shared list", () => {
    const settings = html.slice(html.indexOf("Client services and rules"));
    const hid = settings.slice(settings.indexOf("Hidebrandt Web Services"), settings.indexOf("Teknokraft Canada Inc."));
    const tek = settings.slice(settings.indexOf("Teknokraft Canada Inc."), settings.indexOf("Brent&#x27;s Essentials"));
    expect(hid).toContain("E-commerce website development");
    // Every service is listed as a toggle for both, but only the approved ones are selected.
    expect((hid.match(/border-emerald-600/g) ?? []).length).toBe(5);
    expect((tek.match(/border-emerald-600/g) ?? []).length).toBe(3);
    expect(settings).toContain("Not configured yet");
  });

  it("explains itself clearly before the migration is applied and when nothing is waiting", () => {
    expect(render({ ...data, migrationMissing: true, queue: [], recent: [], legacy: [], metrics: [], settings: [] })).toContain("has not been enabled in the database yet");
    const quiet = render({ ...data, queue: [], recent: [], legacy: [], metrics: [] });
    expect(quiet).toContain("Nothing is waiting.");
    expect(quiet).toContain("No decisions yet.");
    expect(quiet).toContain("Nothing flagged.");
  });
});

describe("agent qualification card", () => {
  const panel = (approvedServices: string[], clientName: string, appointments: { id: string; appointment_date: string; appointment_time: string; qc_status: string; qc_admin_feedback: string | null; qc_rejection_reason: string | null }[] = [], initial = null as never) =>
    renderToStaticMarkup(createElement(QualificationPanel, { leadId: "lead-1", clientName, approvedServices, initial, preliminaryCategory: "existing_website_redesign", appointments }));

  it("shows the eight questions and marks the category preliminary until saved", () => {
    const html = panel(HID, "Hidebrandt Web Services");
    for (const q of ["Does the business currently have a website?", "Is the prospect interested in a new website or a redesign?", "Is the prospect satisfied with the current website?", "Does the business require e-commerce functionality?", "Is the prospect interested in improving search visibility or SEO?", "What specific website-related challenges does the business face?", "Does the prospect understand the services being offered?", "Has the prospect agreed to an appointment to discuss those services?"]) {
      expect(html).toContain(q);
    }
    expect(html).toContain("Existing Website — Redesign Opportunity");
    expect(html).toContain("Preliminary - not yet verified");
    expect(html).toContain("only wants lead generation or cold calling");
  });

  it("offers each client only the services that client approved", () => {
    const hid = panel(HID, "Hidebrandt Web Services");
    const tek = panel(TEK, "Teknokraft Canada Inc.");
    expect(hid).toContain("E-commerce website development");
    expect(hid).toContain("Human search optimization");
    expect(tek).not.toContain("E-commerce website development");
    expect(tek).not.toContain("Human search optimization");
    expect(tek).toContain("New website development");
    expect(tek).toContain("Qualify for Teknokraft Canada Inc.");
  });

  it("disables 'Save as Qualified' until the answers are complete", () => {
    const empty = panel(HID, "Hidebrandt Web Services");
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>Save as Qualified<\/button>/);
    expect(empty).toContain("Answer every required question");
  });

  it("shows approval status, rejection reasons and Admin feedback with a resubmit path", () => {
    const html = panel(HID, "Hidebrandt Web Services", [
      { id: "a1", appointment_date: "2030-01-10", appointment_time: "14:30:00", qc_status: "needs_info", qc_admin_feedback: "Confirm they want a website", qc_rejection_reason: null },
      { id: "a2", appointment_date: "2030-01-12", appointment_time: "10:00:00", qc_status: "rejected", qc_admin_feedback: null, qc_rejection_reason: "Prospect wants lead generation only" },
      { id: "a3", appointment_date: "2030-01-15", appointment_time: "09:00:00", qc_status: "pending_review", qc_admin_feedback: null, qc_rejection_reason: null },
    ]);
    expect(html).toContain("More qualification requested");
    expect(html).toContain("Admin feedback: Confirm they want a website");
    expect(html).toContain("Rejected: Prospect wants lead generation only");
    expect(html).toContain("Awaiting Admin approval");
    expect(html).toContain("Resubmit for approval");
  });
});

describe("saved Google answer is still there after a page refresh", () => {
  // A refresh re-renders the panel from the saved record (`initial`).
  const hydrated = (clientName: string, approvedServices: string[], google_interest: "yes" | "more" | "no") =>
    renderToStaticMarkup(
      createElement(QualificationPanel, {
        leadId: "lead-1",
        clientName,
        approvedServices,
        initial: { ...qualification, ...EMPTY_ANSWERS, google_interest, outcome: "draft", category: null, category_source: "auto_preliminary" },
        preliminaryCategory: "requires_further_qualification",
        appointments: [],
      })
    );

  for (const [clientName, services] of [["Hidebrandt Web Services", HID], ["Teknokraft Canada Inc.", TEK]] as const) {
    it(`${clientName}: the chosen button is pressed and its response is showing`, () => {
      for (const [choice, label, probe] of [["yes", "Yes, I’m interested", "That’s "], ["more", "Tell me more", "Of course!"], ["no", "No, not interested", "No problem at all."]] as const) {
        const html = hydrated(clientName, [...services], choice);
        expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${label}</button>`));
        expect(html).toContain('data-testid="google-response"');
        expect(html).toContain(probe);
      }
    });
  }

  it("no booking or appointment is created or shown just because an answer was chosen", () => {
    const html = hydrated("Hidebrandt Web Services", HID, "yes");
    expect(html).not.toContain('data-testid="booking-script"');
    expect(html).not.toMatch(/Appointment \d{4}-\d{2}-\d{2}/);
  });
});
