import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";

vi.mock("server-only", () => ({}));

const emailsSendMock = vi.fn<
  (params: { to: string; subject: string; text: string; html: string; from: string; replyTo: string }) => Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>
>(async () => ({ data: { id: "resend-email-1" }, error: null }));
vi.mock("@/lib/resend", () => ({ getResendClient: () => ({ emails: { send: emailsSendMock } }) }));

const baseAppointment: WinsalotAppointmentRow = {
  id: "appt-1",
  created_at: "2026-09-11T12:00:00.000Z",
  updated_at: "2026-09-11T12:00:00.000Z",
  opportunity_id: "opportunity-1",
  contact_name: "Jordan Sample",
  business_name: "Acme Test Co.",
  email: "jordan@example.com",
  phone: "+14165551234",
  sms_consent: true,
  service_type: "lead_generation",
  appointment_type: "Phone Call",
  notes: null,
  appointment_start_at: "2026-09-12T14:00:00.000Z",
  appointment_end_at: "2026-09-12T14:15:00.000Z",
  prospect_timezone: "America/Toronto",
  business_timezone: "America/Toronto",
  status: "booked",
  booked_by: "self",
  booked_by_user_id: null,
  assigned_agent_id: "agent-1",
  cancelled_at: null,
  cancelled_by_role: null,
  cancelled_by_user_id: null,
  cancelled_reason: null,
  completed_at: null,
  completed_by_user_id: null,
  completed_by_name: null,
  no_show_at: null,
  no_show_by_user_id: null,
  no_show_by_name: null,
  follow_up_email_status: "not_sent",
  follow_up_email_sent_at: null,
  follow_up_crm_lead_email_id: null,
  admin_notified_at: "2026-09-11T12:00:00.000Z",
  incentive_status: null,
  incentive_status_set_by: null,
  incentive_status_set_at: null,
  incentive_status_reason: null,
};

// A minimal, stateful fake of the service-role client covering exactly the
// call shapes performWinsalotCompletion/performWinsalotNoShow/the follow-up
// email sender use against winsalot_appointments/crm_activities/
// crm_lead_emails/crm_clients/leadgen_users - a real Postgres compare-and-
// swap update (`.eq("status", "booked")` only actually applying while
// that's still true) is what "one time only" ultimately relies on, so this
// fake models that instead of just recording calls.
//
function makeFakeAdmin(initial: WinsalotAppointmentRow) {
  let appt: WinsalotAppointmentRow = { ...initial };
  const crmActivityInserts: Record<string, unknown>[] = [];
  const crmLeadEmailInserts: Record<string, unknown>[] = [];

  function updateBuilder(patch: Record<string, unknown>) {
    const filters: Record<string, unknown> = {};
    function applyIfMatch(): boolean {
      const matches = Object.entries(filters).every(([k, v]) => (appt as unknown as Record<string, unknown>)[k] === v);
      if (matches) appt = { ...appt, ...(patch as Partial<WinsalotAppointmentRow>) };
      return matches;
    }
    const builder = {
      eq(col: string, val: unknown) {
        filters[col] = val;
        return builder;
      },
      select() {
        return {
          maybeSingle: async () => {
            const matched = applyIfMatch();
            return { data: matched ? { ...appt } : null, error: null };
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

  const admin = {
    from(table: string) {
      if (table === "winsalot_appointments") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...appt } }) }) }),
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

  return { admin, crmActivityInserts, crmLeadEmailInserts, getAppointment: () => ({ ...appt }) };
}

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));

describe("performWinsalotCompletion", () => {
  beforeEach(() => {
    emailsSendMock.mockClear();
  });

  it("marks a booked consultation Completed, records who/when, and sends the follow-up email exactly once", async () => {
    const { admin, crmActivityInserts, crmLeadEmailInserts, getAppointment } = makeFakeAdmin(baseAppointment);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotCompletion } = await import("@/lib/winsalot-consultation-completion");

    const result = await performWinsalotCompletion("appt-1", { userId: "user-1", name: "Taylor Admin" });

    expect(result.error).toBeUndefined();
    expect(result.outcome).toBe("completed");
    expect(result.followUpEmailStatus).toBe("Sent");
    // Lets a caller revalidate the linked opportunity's own detail page
    // (e.g. /admin/crm/opportunities/[id]'s Appointments section, which
    // shows this same appointment) alongside the appointment management
    // pages - see completeAppointmentAction.
    expect(result.opportunityId).toBe("opportunity-1");

    const appt = getAppointment();
    expect(appt.status).toBe("completed");
    expect(appt.completed_by_name).toBe("Taylor Admin");
    expect(appt.completed_at).not.toBeNull();
    expect(appt.follow_up_email_status).toBe("sent");

    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    const sentEmail = emailsSendMock.mock.calls[0][0];
    expect(sentEmail.to).toBe(baseAppointment.email);
    // The Reply-To address stays active alongside the new CTA button, and
    // the CTA always links to the public /continue-with-winsalot page -
    // never a protected, authenticated page.
    expect(sentEmail.replyTo).toBeTruthy();
    expect(sentEmail.text).toContain("Continue With Winsalot Corp: ");
    expect(sentEmail.text).toContain("/continue-with-winsalot");
    expect(sentEmail.text).not.toContain("/client/dashboard");
    expect(sentEmail.html).toContain("/continue-with-winsalot");
    expect(crmLeadEmailInserts).toHaveLength(1);
    expect(crmLeadEmailInserts[0].email_type).toBe("consultation_follow_up");
    expect(crmActivityInserts.some((a) => a.activity_type === "consultation_completed")).toBe(true);
  });

  it("never sends a second follow-up email when Complete Consultation is clicked twice", async () => {
    const { admin, getAppointment } = makeFakeAdmin(baseAppointment);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotCompletion } = await import("@/lib/winsalot-consultation-completion");

    const first = await performWinsalotCompletion("appt-1", { userId: "user-1", name: "Taylor Admin" });
    const second = await performWinsalotCompletion("appt-1", { userId: "user-1", name: "Taylor Admin" });

    expect(first.outcome).toBe("completed");
    expect(second.outcome).toBe("already_completed");
    expect(second.error).toBeUndefined();
    expect(second.opportunityId).toBe("opportunity-1");
    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    expect(getAppointment().status).toBe("completed");
  });

  it("refuses to complete a cancelled consultation and never sends a follow-up email", async () => {
    const { admin } = makeFakeAdmin({ ...baseAppointment, status: "cancelled" });
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotCompletion } = await import("@/lib/winsalot-consultation-completion");

    const result = await performWinsalotCompletion("appt-1", { userId: "user-1", name: "Taylor Admin" });

    expect(result.error).toContain("cancelled");
    expect(emailsSendMock).not.toHaveBeenCalled();
  });

  it("refuses to complete a No Show consultation and never sends a follow-up email", async () => {
    const { admin } = makeFakeAdmin({ ...baseAppointment, status: "no_show" });
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotCompletion } = await import("@/lib/winsalot-consultation-completion");

    const result = await performWinsalotCompletion("appt-1", { userId: "user-1", name: "Taylor Admin" });

    expect(result.error).toContain("No Show");
    expect(emailsSendMock).not.toHaveBeenCalled();
  });
});

describe("performWinsalotNoShow", () => {
  beforeEach(() => {
    emailsSendMock.mockClear();
  });

  it("marks a booked consultation No Show, records who/when, and never sends the follow-up email", async () => {
    const { admin, getAppointment } = makeFakeAdmin(baseAppointment);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotNoShow } = await import("@/lib/winsalot-consultation-completion");

    const result = await performWinsalotNoShow("appt-1", { userId: "user-1", name: "Taylor Admin" });

    expect(result.error).toBeUndefined();
    expect(result.opportunityId).toBe("opportunity-1");
    const appt = getAppointment();
    expect(appt.status).toBe("no_show");
    expect(appt.no_show_by_name).toBe("Taylor Admin");
    expect(appt.no_show_at).not.toBeNull();
    expect(emailsSendMock).not.toHaveBeenCalled();
  });
});

describe("consultation follow-up email content", () => {
  beforeEach(() => {
    emailsSendMock.mockClear();
  });

  it("always includes the public Continue With Winsalot Corp CTA, never a protected client dashboard link", async () => {
    const { admin } = makeFakeAdmin(baseAppointment);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { getWinsalotFollowUpEmailPreview } = await import("@/lib/winsalot-consultation-completion");

    const preview = await getWinsalotFollowUpEmailPreview("appt-1");

    expect(preview.error).toBeUndefined();
    expect("text" in preview && preview.text).toContain("Continue With Winsalot Corp: ");
    expect("text" in preview && preview.text).toContain("/continue-with-winsalot");
    expect("text" in preview && preview.text).not.toContain("/client/dashboard");
    // The Reply-To address stays active regardless of the CTA - a prospect
    // can always reply directly if they prefer.
    expect("text" in preview && preview.text).toContain("reply directly to this email");
    expect("subject" in preview && preview.subject).toBe("Thank you for speaking with Winsalot Corp");
    expect(emailsSendMock).not.toHaveBeenCalled();
  });
});

describe("sendManualWinsalotFollowUpEmail / getWinsalotFollowUpEmailPreview", () => {
  beforeEach(() => {
    emailsSendMock.mockClear();
  });

  it("previewing never sends anything or changes tracked status", async () => {
    const { admin, getAppointment } = makeFakeAdmin(baseAppointment);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { getWinsalotFollowUpEmailPreview } = await import("@/lib/winsalot-consultation-completion");

    await getWinsalotFollowUpEmailPreview("appt-1");

    expect(emailsSendMock).not.toHaveBeenCalled();
    expect(getAppointment().follow_up_email_status).toBe("not_sent");
  });

  it("an admin can send the follow-up email for a cancelled consultation as an explicit manual choice", async () => {
    const { admin, getAppointment, crmActivityInserts } = makeFakeAdmin({ ...baseAppointment, status: "cancelled" });
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { sendManualWinsalotFollowUpEmail } = await import("@/lib/winsalot-consultation-completion");

    const result = await sendManualWinsalotFollowUpEmail("appt-1", "Taylor Admin");

    expect(result.status).toBe("sent");
    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    expect(getAppointment().follow_up_email_status).toBe("sent");
    expect(crmActivityInserts.some((a) => String(a.notes).includes("by Taylor Admin"))).toBe(true);
  });

  it("an admin can resend the follow-up email after it already went out once", async () => {
    const { admin, getAppointment } = makeFakeAdmin(baseAppointment);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { performWinsalotCompletion, sendManualWinsalotFollowUpEmail } = await import("@/lib/winsalot-consultation-completion");

    await performWinsalotCompletion("appt-1", { userId: "user-1", name: "Taylor Admin" });
    expect(emailsSendMock).toHaveBeenCalledTimes(1);

    const resendResult = await sendManualWinsalotFollowUpEmail("appt-1", "Jordan Ops");

    expect(resendResult.status).toBe("sent");
    expect(emailsSendMock).toHaveBeenCalledTimes(2);
    expect(getAppointment().status).toBe("completed");
  });
});

describe("fetchWinsalotFollowUpStatusMap", () => {
  it("shows Not Sent with no recipient for an appointment that was never sent a follow-up", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: (table: string) => {
        if (table === "crm_lead_emails") return { select: () => ({ in: async () => ({ data: [] }) }) };
        throw new Error(`Unexpected table: ${table}`);
      },
    } as never);
    const { fetchWinsalotFollowUpStatusMap } = await import("@/lib/winsalot-consultation-completion");

    const result = await fetchWinsalotFollowUpStatusMap([{ id: "appt-1", follow_up_email_status: "not_sent", follow_up_crm_lead_email_id: null }]);

    expect(result["appt-1"]).toEqual({ followUpEmailStatus: "Not Sent", followUpEmailError: null, followUpEmailRecipient: null });
  });

  it("upgrades Sent to Delivered and reports the recipient once the Resend webhook confirms delivery", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: (table: string) => {
        if (table === "crm_lead_emails") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ id: "tracked-email-1", to_email: "jordan@example.com", status: "delivered", bounce_reason: null, failure_reason: null }],
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as never);
    const { fetchWinsalotFollowUpStatusMap } = await import("@/lib/winsalot-consultation-completion");

    const result = await fetchWinsalotFollowUpStatusMap([
      { id: "appt-1", follow_up_email_status: "sent", follow_up_crm_lead_email_id: "tracked-email-1" },
    ]);

    expect(result["appt-1"]).toEqual({ followUpEmailStatus: "Delivered", followUpEmailError: null, followUpEmailRecipient: "jordan@example.com" });
  });
});
