import { describe, expect, it, vi } from "vitest";
import type { WinsalotAppointmentRow } from "@/lib/winsalot-consultation-types";

vi.mock("server-only", () => ({}));

const claimAndSendAppointmentSmsMock = vi.fn(
  async (_admin, input: { recipientType: string; toPhoneRaw: string | null; occurrenceKey: string; message: string }) => ({
    outcome: "sent" as const,
    recipientPhone: input.toPhoneRaw,
  })
);

vi.mock("@/lib/appointment-sms", async () => {
  const actual = await vi.importActual<typeof import("@/lib/appointment-sms")>("@/lib/appointment-sms");
  return { ...actual, claimAndSendAppointmentSms: claimAndSendAppointmentSmsMock };
});

vi.mock("@/lib/winsalot-consultation-tokens", () => ({ createWinsalotActionToken: vi.fn(async () => "token-abc") }));

const emailsSendMock = vi.fn<
  (params: { to: string; subject: string; text: string; html: string; from: string; replyTo: string }) => Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>
>(async () => ({ data: { id: "resend-email-1" }, error: null }));
vi.mock("@/lib/resend", () => ({ getResendClient: () => ({ emails: { send: emailsSendMock } }) }));

const appointment = {
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
  admin_notified_at: "2026-09-11T12:00:00.000Z",
  incentive_status: null,
  incentive_status_set_by: null,
  incentive_status_set_at: null,
  incentive_status_reason: null,
} as unknown as WinsalotAppointmentRow;

function fakeAdmin(automaticSmsRemindersEnabled: boolean) {
  const crmLeadEmailInserts: Record<string, unknown>[] = [];
  const crmActivityInserts: Record<string, unknown>[] = [];

  const admin = {
    from: (table: string) => {
      if (table === "winsalot_appointments") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: appointment }) }) }) };
      }
      if (table === "winsalot_appointment_reminder_settings") {
        return {
          select: () => ({
            maybeSingle: async () => ({
              data: {
                id: "settings",
                automatic_sms_reminders_enabled: automaticSmsRemindersEnabled,
                company_sms_notification_number: null,
                updated_at: "2026-09-11T12:00:00.000Z",
                updated_by_name: null,
              },
            }),
          }),
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
      if (table === "crm_activities") {
        return {
          insert: async (row: Record<string, unknown>) => {
            crmActivityInserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, crmLeadEmailInserts, crmActivityInserts };
}

describe("sendManualWinsalotAppointmentEmail", () => {
  it("sends a resend-confirmation email and records it in crm_lead_emails as appointment_confirmation", async () => {
    emailsSendMock.mockClear();
    const { sendManualWinsalotAppointmentEmail } = await import("@/lib/winsalot-consultation-reminders");
    const { admin, crmLeadEmailInserts, crmActivityInserts } = fakeAdmin(true);

    const result = await sendManualWinsalotAppointmentEmail(admin as never, appointment.id, "resend_confirmation", "Admin User");

    expect(result.error).toBeUndefined();
    expect(result.crmLeadEmailId).toBe("crm-lead-email-1");
    expect(emailsSendMock).toHaveBeenCalledTimes(1);
    expect(emailsSendMock.mock.calls[0][0].to).toBe(appointment.email);
    expect(emailsSendMock.mock.calls[0][0].subject).toContain("Winsalot Corp");

    expect(crmLeadEmailInserts).toHaveLength(1);
    expect(crmLeadEmailInserts[0].email_type).toBe("appointment_confirmation");
    expect(crmActivityInserts).toHaveLength(1);
    expect(crmActivityInserts[0].notes).toContain("confirmation resent");
    expect(crmActivityInserts[0].notes).toContain("Admin User");
  });

  it("sends a manual reminder email and records it as appointment_reminder", async () => {
    emailsSendMock.mockClear();
    const { sendManualWinsalotAppointmentEmail } = await import("@/lib/winsalot-consultation-reminders");
    const { admin, crmLeadEmailInserts, crmActivityInserts } = fakeAdmin(true);

    const result = await sendManualWinsalotAppointmentEmail(admin as never, appointment.id, "reminder", "Agent User");

    expect(result.error).toBeUndefined();
    expect(crmLeadEmailInserts[0].email_type).toBe("appointment_reminder");
    expect(crmActivityInserts[0].notes).toContain("reminder sent");
    expect(crmActivityInserts[0].notes).toContain("Agent User");
  });

  it("returns an error when Resend fails, without crashing", async () => {
    emailsSendMock.mockClear();
    emailsSendMock.mockResolvedValueOnce({ data: null, error: { message: "Resend rejected the request." } });
    const { sendManualWinsalotAppointmentEmail } = await import("@/lib/winsalot-consultation-reminders");
    const { admin, crmLeadEmailInserts } = fakeAdmin(true);

    const result = await sendManualWinsalotAppointmentEmail(admin as never, appointment.id, "resend_confirmation", "Admin User");

    expect(result.error).toBe("Resend rejected the request.");
    expect(crmLeadEmailInserts).toHaveLength(0);
  });
});

describe("sendManualWinsalotAppointmentSms", () => {
  it("does not attempt a send when automatic SMS reminders are disabled", async () => {
    claimAndSendAppointmentSmsMock.mockClear();
    const { sendManualWinsalotAppointmentSms } = await import("@/lib/winsalot-consultation-reminders");
    const { admin } = fakeAdmin(false);

    const result = await sendManualWinsalotAppointmentSms(admin as never, appointment, "resend_confirmation");

    expect(result.outcome).toBe("disabled");
    expect(claimAndSendAppointmentSmsMock).not.toHaveBeenCalled();
  });

  it("sends a manual resend-confirmation SMS under a fresh, always-unique occurrence key describing it as a phone call appointment", async () => {
    claimAndSendAppointmentSmsMock.mockClear();
    const { sendManualWinsalotAppointmentSms } = await import("@/lib/winsalot-consultation-reminders");
    const { admin } = fakeAdmin(true);

    const result = await sendManualWinsalotAppointmentSms(admin as never, appointment, "resend_confirmation");

    expect(result.outcome).toBe("sent");
    expect(claimAndSendAppointmentSmsMock).toHaveBeenCalledTimes(1);
    const [, input] = claimAndSendAppointmentSmsMock.mock.calls[0];
    expect(input.recipientType).toBe("prospect");
    expect(input.toPhoneRaw).toBe(appointment.phone);
    expect(input.occurrenceKey).toMatch(/^manual_resend_confirmation:\d+$/);
    expect(input.message).toContain("phone call appointment");
    expect(input.message).toContain("is confirmed for");
  });

  it("sends a manual reminder SMS distinguishable from the confirmation send", async () => {
    claimAndSendAppointmentSmsMock.mockClear();
    const { sendManualWinsalotAppointmentSms } = await import("@/lib/winsalot-consultation-reminders");
    const { admin } = fakeAdmin(true);

    const result = await sendManualWinsalotAppointmentSms(admin as never, appointment, "reminder");

    expect(result.outcome).toBe("sent");
    const [, input] = claimAndSendAppointmentSmsMock.mock.calls[0];
    expect(input.occurrenceKey).toMatch(/^manual_reminder:\d+$/);
    expect(input.message).toContain("phone call appointment");
    expect(input.message).toContain("is in");
  });
});
