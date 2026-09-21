import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmConsultationGuideRow } from "@/lib/consultation-guide";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://app.winsalotcorp.com" }));
vi.mock("@/lib/email-senders", () => ({
  getEmailSender: (category: string) => `Winsalot Corp. <${category}@winsalotcorp.com>`,
  getEmailReplyTo: () => "info@winsalotcorp.com",
}));

const emailsSendMock = vi.fn<
  (params: { to: string; subject: string; text: string; html: string; from: string; replyTo: string }) => Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>
>(async () => ({ data: { id: "resend-email-1" }, error: null }));
vi.mock("@/lib/resend", () => ({ getResendClient: () => ({ emails: { send: emailsSendMock } }) }));

const baseGuide: CrmConsultationGuideRow = {
  id: "guide-1",
  created_at: "2026-09-11T12:00:00.000Z",
  updated_at: "2026-09-11T12:00:00.000Z",
  created_by: "admin-1",
  updated_by: "admin-1",
  opportunity_id: "opportunity-1",
  appointment_id: null,
  status: "completed",
  completed_at: "2026-09-11T12:00:00.000Z",
  completed_by: "admin-1",
  service: "lead_generation",
  business_name: "Web6 Solutions",
  contact_name: "Jordan",
  phone: "16043323930",
  email: "jordan@web6solutions.com",
  industry: "Web Design",
  location: null,
  consultation_date: "2026-09-11",
  consultant_name: "Taylor Admin",
  discovery: {},
  leadgen_fit_status: null,
  leadgen_fit: {},
  campaign_expectations: {},
  lending_fit_status: null,
  lending_fit: {},
  summary: {},
  arrangement_type: "standard_monthly",
  arrangement_standard_fee: 750,
  arrangement_upfront_payment: 0,
  arrangement_payment_trigger: null,
  arrangement_attribution_period: null,
  arrangement_service: null,
  arrangement_client_services: null,
  arrangement_campaign_status: null,
  arrangement_conversion_status: null,
  arrangement_fee_status: null,
  arrangement_special_terms: null,
  checklist: {},
  notes: null,
  follow_up_email_status: "not_sent",
  follow_up_email_sent_at: null,
  follow_up_email_service: null,
  follow_up_email_error: null,
  follow_up_crm_lead_email_id: null,
  no_follow_up_email_reason: null,
  follow_up_email_subject: null,
  follow_up_email_body: null,
  follow_up_email_resend_count: 0,
  follow_up_email_last_resent_at: null,
  follow_up_email_last_resent_by: null,
  follow_up_email_last_resend_error: null,
} as CrmConsultationGuideRow;

// A minimal, stateful fake of the (session or service-role) client
// covering exactly the call shapes this file's functions use against
// crm_consultation_guides/crm_activities/crm_lead_emails - a real Postgres
// compare-and-swap update (`.in("follow_up_email_status", [...])` only
// actually applying while a row still matches) is what "never sends two
// copies" ultimately relies on, so this fake models that instead of just
// recording calls.
function makeFakeClient(initial: CrmConsultationGuideRow) {
  let guide: CrmConsultationGuideRow = { ...initial };
  const crmActivityInserts: Record<string, unknown>[] = [];
  const crmLeadEmailInserts: Record<string, unknown>[] = [];

  function updateBuilder(patch: Record<string, unknown>) {
    const filters: { col: string; op: "eq" | "in"; val: unknown }[] = [];
    function applyIfMatch(): boolean {
      const matches = filters.every(({ col, op, val }) => {
        const current = (guide as unknown as Record<string, unknown>)[col];
        return op === "eq" ? current === val : Array.isArray(val) && (val as unknown[]).includes(current);
      });
      if (matches) guide = { ...guide, ...(patch as Partial<CrmConsultationGuideRow>) };
      return matches;
    }
    const builder = {
      eq(col: string, val: unknown) {
        filters.push({ col, op: "eq", val });
        return builder;
      },
      in(col: string, val: unknown[]) {
        filters.push({ col, op: "in", val });
        return builder;
      },
      select() {
        return {
          maybeSingle: async () => {
            const matched = applyIfMatch();
            return { data: matched ? { id: guide.id } : null, error: null };
          },
        };
      },
      then(resolve: (v: { data: null; error: null }) => void, reject: (e: unknown) => void) {
        applyIfMatch();
        Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      if (table === "crm_consultation_guides") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...guide }, error: null }) }) }),
          update: (patch: Record<string, unknown>) => updateBuilder(patch),
        };
      }
      if (table === "crm_activities") {
        return {
          insert: async (row: Record<string, unknown>) => {
            crmActivityInserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      if (table === "crm_lead_emails") {
        return {
          insert: (row: Record<string, unknown>) => {
            crmLeadEmailInserts.push(row);
            return { select: () => ({ maybeSingle: async () => ({ data: { id: "crm-lead-email-1" }, error: null }) }) };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, crmActivityInserts, crmLeadEmailInserts, getGuide: () => ({ ...guide }) };
}

describe("buildFollowUpEmailDraft", () => {
  it("returns null when no service is selected", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");
    const draft = buildFollowUpEmailDraft({ ...baseGuide, service: null }, "Taylor Admin");
    expect(draft).toBeNull();
  });

  it("includes only the recap lines actually saved in Section 8 - never invented content", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");
    const draftWithSummary = buildFollowUpEmailDraft(
      { ...baseGuide, summary: { primary_need: "More qualified appointments", next_step: "Kickoff call next week" } },
      "Taylor Admin"
    );
    expect(draftWithSummary?.body).toContain("As discussed, your primary need is: More qualified appointments");
    expect(draftWithSummary?.body).toContain("Next step: Kickoff call next week");

    const draftWithoutSummary = buildFollowUpEmailDraft({ ...baseGuide, summary: {} }, "Taylor Admin");
    expect(draftWithoutSummary?.body).not.toContain("As discussed, your primary need is:");
    expect(draftWithoutSummary?.body).not.toContain("Next step:");
  });

  it("appends the arrangement note only for a non-standard commercial arrangement", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");
    const standard = buildFollowUpEmailDraft({ ...baseGuide, arrangement_type: "standard_monthly" }, "Taylor Admin");
    expect(standard?.body).not.toContain("Winsalot Corp. generates and qualifies opportunities");

    const trial = buildFollowUpEmailDraft(
      { ...baseGuide, arrangement_type: "performance_based_trial", arrangement_payment_trigger: "your first conversion closes" },
      "Taylor Admin"
    );
    expect(trial?.body).toContain("performance-based trial");
    expect(trial?.body).toContain("your first conversion closes");
    expect(trial?.body).toContain("Winsalot Corp. generates and qualifies opportunities");
  });
});

describe("buildFollowUpEmailDraft - Custom – Split Payment / Performance Milestones", () => {
  const teknokraftGuide: CrmConsultationGuideRow = {
    ...baseGuide,
    business_name: "Teknokraft Canada Inc.",
    contact_name: "Shahbaz",
    consultant_name: "C.J. Amadi",
    arrangement_type: "custom_split_payment",
    arrangement_standard_fee: 750,
    arrangement_upfront_payment: 250,
    arrangement_service: "B2B Lead Generation / Appointment Setting",
    arrangement_client_services: "Website Design, Website Redesign and SEO",
    arrangement_total_value: 750,
    arrangement_milestone_1_amount: 250,
    arrangement_milestone_1_condition: "Upon the first successful client conversion generated through Winsalot Corp.",
    arrangement_milestone_2_amount: 250,
    arrangement_milestone_2_condition: "Upon the second successful client conversion generated through Winsalot Corp.",
    arrangement_payment_trigger: "A prospect sourced/generated by Winsalot Corp. who becomes a paying customer of Teknokraft Canada Inc.",
    arrangement_campaign_start_date: null,
  } as CrmConsultationGuideRow;

  it("discloses every required item: service, total value, deposit, both milestones, conversion definition, and renewal rate", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");
    const draft = buildFollowUpEmailDraft(teknokraftGuide, "C.J. Amadi");

    expect(draft?.subject).toBe("Teknokraft Canada Inc. × Winsalot Corp. — Agreed Next Steps");
    expect(draft?.body).toContain("Hi Shahbaz,");
    expect(draft?.body).toContain("B2B Lead Generation / Appointment Setting service under a custom initial payment arrangement");
    expect(draft?.body).toContain("The total value of the initial engagement remains $750, structured as follows:");
    expect(draft?.body).toContain("$250 upfront to begin the campaign");
    expect(draft?.body).toContain("$250 upon the first successful client conversion generated through Winsalot Corp.");
    expect(draft?.body).toContain("$250 upon the second successful client conversion generated through Winsalot Corp.");
    expect(draft?.body).toContain("a successful conversion means a prospect sourced/generated by Winsalot Corp. who becomes a paying customer of Teknokraft Canada Inc.");
    expect(draft?.body).toContain("Website Design, Website Redesign and SEO");
    expect(draft?.body).toContain("our standard $750/month");
    expect(draft?.body).toContain("Best regards,");
    expect(draft?.body).toContain("C.J. Amadi");
  });

  it("never doubles a period when the business name or conversion definition already ends its own sentence with one", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");
    const draft = buildFollowUpEmailDraft(teknokraftGuide, "C.J. Amadi");

    expect(draft?.body).not.toContain("Inc..");
    expect(draft?.body).toContain("a paying customer of Teknokraft Canada Inc.\n");
    expect(draft?.body).toContain("We look forward to working with Teknokraft Canada Inc.\n");
  });

  it("never mentions replacing Winsalot Corp.'s standard $750/month pricing for other clients - this is a first-engagement-only arrangement", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");
    const draft = buildFollowUpEmailDraft(teknokraftGuide, "C.J. Amadi");
    // The disclaimer about not replacing standard pricing is an *internal*
    // note (arrangement_special_terms) - never sent to the client.
    expect(draft?.body).not.toContain("Does not replace");
  });

  it("includes the launch-date paragraph only when a campaign start date is saved, formatted as month + day", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");

    const withoutDate = buildFollowUpEmailDraft(teknokraftGuide, "C.J. Amadi");
    expect(withoutDate?.body).not.toContain("looking forward to launching");

    const withDate = buildFollowUpEmailDraft({ ...teknokraftGuide, arrangement_campaign_start_date: "2026-10-01" }, "C.J. Amadi");
    expect(withDate?.body).toContain(
      "We're looking forward to launching your campaign on October 1. Between now and launch, we'll finalize the targeting, outreach messaging, qualification criteria, and campaign setup so everything is ready to begin."
    );
  });

  it("uses the saved Section 8 next step verbatim when set, instead of the generic fallback", async () => {
    const { buildFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");

    const genericFallback = buildFollowUpEmailDraft(teknokraftGuide, "C.J. Amadi");
    expect(genericFallback?.body).toContain("The next step is the initial $250 payment");

    const withNextStep = buildFollowUpEmailDraft(
      {
        ...teknokraftGuide,
        summary: {
          next_step:
            "Client confirmed campaign start date of October 1, 2026. Winsalot Corp. will complete onboarding and campaign preparation before launch, including targeting, messaging, qualification criteria, call script, prospect list, and tracking setup. Initial $250 payment is due before campaign activation.",
        },
      },
      "C.J. Amadi"
    );
    expect(withNextStep?.body).toContain("Next step: Client confirmed campaign start date of October 1, 2026.");
    expect(withNextStep?.body).not.toContain("The next step is the initial $250 payment, after which");
  });
});

describe("ensureFollowUpEmailDraft", () => {
  it("never overwrites an already-generated (possibly admin-edited) draft", async () => {
    const { client, getGuide } = makeFakeClient({ ...baseGuide, follow_up_email_subject: "Edited subject", follow_up_email_body: "Edited body" });
    const { ensureFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");

    const draft = await ensureFollowUpEmailDraft(client as never, getGuide(), "Taylor Admin");

    expect(draft).toEqual({ subject: "Edited subject", body: "Edited body" });
    expect(getGuide().follow_up_email_subject).toBe("Edited subject");
  });

  it("backfills a draft for a guide completed before this feature existed (e.g. via direct migration)", async () => {
    const { client, getGuide } = makeFakeClient({ ...baseGuide, follow_up_email_subject: null, follow_up_email_body: null });
    const { ensureFollowUpEmailDraft } = await import("@/lib/consultation-guide-email");

    const draft = await ensureFollowUpEmailDraft(client as never, getGuide(), "Taylor Admin");

    expect(draft).not.toBeNull();
    expect(getGuide().follow_up_email_subject).toBe(draft?.subject);
    expect(getGuide().follow_up_email_body).toBe(draft?.body);
    expect(emailsSendMock).not.toHaveBeenCalled();
  });
});

describe("sendConsultationGuideFollowUpEmail", () => {
  beforeEach(() => {
    emailsSendMock.mockClear();
  });

  it("refuses to send when no draft has been generated yet", async () => {
    const { client } = makeFakeClient({ ...baseGuide, follow_up_email_subject: null, follow_up_email_body: null });
    const { sendConsultationGuideFollowUpEmail } = await import("@/lib/consultation-guide-email");

    const result = await sendConsultationGuideFollowUpEmail(client as never, { ...baseGuide, follow_up_email_subject: null, follow_up_email_body: null }, {
      name: "Taylor Admin",
      email: "taylor@winsalotcorp.com",
    });

    expect(result.status).toBe("failed");
    expect("error" in result && result.error).toContain("No email draft has been generated");
    expect(emailsSendMock).not.toHaveBeenCalled();
  });

  it("sends exactly the saved draft - not a freshly recomputed template - so an admin edit before Send is what's actually sent", async () => {
    const editedGuide = { ...baseGuide, follow_up_email_subject: "Custom subject Jordan will see", follow_up_email_body: "Custom body text." };
    const { client, getGuide, crmLeadEmailInserts, crmActivityInserts } = makeFakeClient(editedGuide);
    const { sendConsultationGuideFollowUpEmail } = await import("@/lib/consultation-guide-email");

    const result = await sendConsultationGuideFollowUpEmail(client as never, editedGuide, { name: "Taylor Admin", email: "taylor@winsalotcorp.com" });

    expect(result.status).toBe("sent");
    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    const sentEmail = emailsSendMock.mock.calls[0][0];
    expect(sentEmail.subject).toBe("Custom subject Jordan will see");
    expect(sentEmail.text).toBe("Custom body text.");
    expect(sentEmail.to).toBe("jordan@web6solutions.com");

    const finalGuide = getGuide();
    expect(finalGuide.follow_up_email_status).toBe("sent");
    expect(finalGuide.follow_up_email_sent_at).not.toBeNull();
    expect(crmLeadEmailInserts).toHaveLength(1);
    expect(crmActivityInserts).toHaveLength(1);
  });

  it("never sends a second copy when clicked twice - the compare-and-swap claim blocks the duplicate", async () => {
    const draftGuide = { ...baseGuide, follow_up_email_subject: "Subject", follow_up_email_body: "Body" };
    const { client } = makeFakeClient(draftGuide);
    const { sendConsultationGuideFollowUpEmail } = await import("@/lib/consultation-guide-email");
    const consultant = { name: "Taylor Admin", email: "taylor@winsalotcorp.com" };

    const [first, second] = await Promise.all([
      sendConsultationGuideFollowUpEmail(client as never, draftGuide, consultant),
      sendConsultationGuideFollowUpEmail(client as never, draftGuide, consultant),
    ]);

    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(["failed", "sent"]);
    expect(emailsSendMock).toHaveBeenCalledTimes(1);
  });
});

describe("resendConsultationGuideFollowUpEmail", () => {
  beforeEach(() => {
    emailsSendMock.mockClear();
  });

  it("sends whatever is currently saved (which may have been edited again since the original send) without touching the original send's own record", async () => {
    const sentGuide = {
      ...baseGuide,
      follow_up_email_status: "sent" as const,
      follow_up_email_sent_at: "2026-09-10T09:00:00.000Z",
      follow_up_email_subject: "Re-edited subject",
      follow_up_email_body: "Re-edited body.",
      follow_up_email_resend_count: 0,
    };
    const { client, getGuide } = makeFakeClient(sentGuide);
    const { resendConsultationGuideFollowUpEmail } = await import("@/lib/consultation-guide-email");

    const result = await resendConsultationGuideFollowUpEmail(client as never, sentGuide, {
      name: "Taylor Admin",
      email: "taylor@winsalotcorp.com",
      userId: "admin-1",
    });

    expect(result.status).toBe("sent");
    const sentEmail = emailsSendMock.mock.calls[0][0];
    expect(sentEmail.subject).toBe("Re-edited subject");
    expect(sentEmail.text).toBe("Re-edited body.");

    const finalGuide = getGuide();
    // The original send's own bookkeeping is untouched by a resend.
    expect(finalGuide.follow_up_email_sent_at).toBe("2026-09-10T09:00:00.000Z");
    expect(finalGuide.follow_up_email_resend_count).toBe(1);
  });
});
