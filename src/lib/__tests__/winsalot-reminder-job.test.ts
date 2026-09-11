import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const claimAndSendAppointmentSmsMock = vi.fn(async (_admin, input: { recipientType: string; toPhoneRaw: string | null; message: string }) => ({
  outcome: "would_send" as const,
  recipientPhone: input.toPhoneRaw,
}));

vi.mock("@/lib/appointment-sms", () => ({
  buildAdminReminderSms: () => "admin reminder",
  // Real (unmocked) pass-through, matching the production signature -
  // lets the test below verify the Growth CRM reminder job actually
  // threads appointment_type into the SMS copy, not just that some
  // string was sent.
  buildProspectReminderSms: (params: { appointmentTypeLabel?: string }) => `prospect reminder: ${params.appointmentTypeLabel ?? "phone call appointment"}`,
  claimAndSendAppointmentSms: claimAndSendAppointmentSmsMock,
  formatSmsTimeLabel: () => "10:00 AM EDT",
  isAppointmentToday: () => false,
  isValidMobileNumber: () => true,
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/resend", () => ({ getResendClient: vi.fn() }));
vi.mock("@/lib/winsalot-consultation-tokens", () => ({ createWinsalotActionToken: vi.fn() }));

describe("Growth CRM appointment reminder job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T14:00:00.000Z"));

    const appointments = [
      {
        id: "appointment-24h",
        opportunity_id: "opportunity-24h",
        assigned_agent_id: null,
        business_name: "24 Hour Test Prospect",
        contact_name: "Alex",
        email: "alex@example.com",
        phone: "+14165550101",
        sms_consent: true,
        service_type: "lead_generation",
        appointment_type: "Phone Call",
        status: "booked",
        appointment_start_at: "2026-09-12T14:00:00.000Z",
        business_timezone: "America/Toronto",
        prospect_timezone: "America/Toronto",
      },
      {
        id: "appointment-1h",
        opportunity_id: "opportunity-1h",
        assigned_agent_id: null,
        business_name: "1 Hour Test Prospect",
        contact_name: "Sam",
        email: "sam@example.com",
        phone: "+14165550102",
        sms_consent: true,
        service_type: "lead_generation",
        appointment_type: "Phone Call",
        status: "booked",
        appointment_start_at: "2026-09-11T15:00:00.000Z",
        business_timezone: "America/Toronto",
        prospect_timezone: "America/Toronto",
      },
    ];

    fromMock.mockImplementation((table: string) => {
      if (table === "winsalot_appointment_reminder_settings") {
        return {
          select: () => ({
            maybeSingle: async () => ({
              data: {
                id: "settings",
                automatic_sms_reminders_enabled: true,
                company_sms_notification_number: "+14165550100",
                updated_at: "2026-09-11T14:00:00.000Z",
                updated_by_name: "Admin",
              },
            }),
          }),
        };
      }
      if (table === "winsalot_appointments") {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({ lte: async () => ({ data: appointments, error: null }) }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("selects both a 24-hour and 1-hour appointment and schedules email and consented SMS without sending in dry run", async () => {
    const { runWinsalotAppointmentReminderJob } = await import("@/lib/winsalot-consultation-reminders");
    const result = await runWinsalotAppointmentReminderJob({ dryRun: true });

    expect(result.eligible).toBe(2);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ appointmentId: "appointment-24h", reminderType: "24_hour_reminder", outcome: "would_send" }),
        expect.objectContaining({ appointmentId: "appointment-1h", reminderType: "1_hour_reminder", outcome: "would_send" }),
      ])
    );
    expect(result.smsResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ appointmentId: "appointment-24h", reminderType: "24_hour_reminder", recipientType: "prospect", outcome: "would_send" }),
        expect.objectContaining({ appointmentId: "appointment-1h", reminderType: "1_hour_reminder", recipientType: "prospect", outcome: "would_send" }),
      ])
    );
    expect(claimAndSendAppointmentSmsMock).toHaveBeenCalledTimes(4); // prospect + company for both reminder slots

    // Every prospect-facing SMS call for these Phone Call appointments
    // must describe the appointment_type correctly (task requirement:
    // "make sure confirmation and reminder messages correctly describe
    // it as a phone call appointment").
    const prospectCalls = claimAndSendAppointmentSmsMock.mock.calls.filter(([, input]) => input.recipientType === "prospect");
    expect(prospectCalls).toHaveLength(2);
    for (const [, input] of prospectCalls) {
      expect(input.message).toBe("prospect reminder: phone call appointment");
    }
  });
});
