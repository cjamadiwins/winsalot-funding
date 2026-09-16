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
// activeClient, when set, makes resolveActiveClientDashboardLink resolve a
// real dashboard link for the appointment's email (an Active crm_clients
// row linked to a leadgen_client_id with one active leadgen_users portal
// login) - omitted/undefined means "no matching client", the default and
// far more common case in these tests.
function makeFakeAdmin(initial: WinsalotAppointmentRow, activeClient?: boolean) {
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
      if (table === "crm_clients") {
        return {
          select: () => ({
            ilike: () => ({
              eq: () => ({
                not: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: activeClient ? { leadgen_client_id: "leadgen-client-1" } : null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "leadgen_users") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: activeClient ? { id: "portal-user-1" } : null }),
                  }),
                }),
              }),
            }),
          }),
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

    const appt = getAppointment();
    expect(appt.status).toBe("completed");
    expect(appt.completed_by_name).toBe("Taylor Admin");
    expect(appt.completed_at).not.toBeNull();
    expect(appt.follow_up_email_status).toBe("sent");

    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    expect(emailsSendMock.mock.calls[0][0].to).toBe(baseAppointment.email);
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

  it("includes the client dashboard button for a recipient who is already an active, portal-enabled client", async () => {
    const { admin } = makeFakeAdmin(baseAppointment, true);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { getWinsalotFollowUpEmailPreview } = await import("@/lib/winsalot-consultation-completion");

    const preview = await getWinsalotFollowUpEmailPreview("appt-1");

    expect(preview.error).toBeUndefined();
    expect("text" in preview && preview.text).toContain("Go to My Client Dashboard");
    expect("text" in preview && preview.text).toContain("/client/dashboard");
    expect(emailsSendMock).not.toHaveBeenCalled();
  });

  it("falls back to a reply-to prompt, with no dashboard link, for a prospect who isn't an active client yet", async () => {
    const { admin } = makeFakeAdmin(baseAppointment, false);
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { getWinsalotFollowUpEmailPreview } = await import("@/lib/winsalot-consultation-completion");

    const preview = await getWinsalotFollowUpEmailPreview("appt-1");

    expect("text" in preview && preview.text).not.toContain("/client/dashboard");
    expect("text" in preview && preview.text).toContain("reply to this email");
    expect("subject" in preview && preview.subject).toBe("Thank you for speaking with Winsalot Corp");
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
