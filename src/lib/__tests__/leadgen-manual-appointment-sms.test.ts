import { describe, expect, it, vi } from "vitest";
import type { LeadgenAppointmentRow } from "@/lib/leadgen-types";

vi.mock("server-only", () => ({}));

const claimAndSendAppointmentSmsMock = vi.fn(
  async (
    _admin,
    input: { recipientType: string; toPhoneRaw: string | null; occurrenceKey: string; message: string }
  ) => ({ outcome: "sent" as const, recipientPhone: input.toPhoneRaw })
);

vi.mock("@/lib/appointment-sms", async () => {
  const actual = await vi.importActual<typeof import("@/lib/appointment-sms")>("@/lib/appointment-sms");
  return {
    ...actual,
    claimAndSendAppointmentSms: claimAndSendAppointmentSmsMock,
  };
});

const appointment: LeadgenAppointmentRow = {
  id: "appointment-1",
  created_at: "2026-09-11T12:00:00.000Z",
  updated_at: "2026-09-11T12:00:00.000Z",
  client_id: "client-1",
  campaign_id: null,
  lead_id: "lead-1",
  business_name: "Brent's Essentials",
  contact_name: "Brent Smith",
  email: "brent@example.com",
  phone: "+14165551234",
  sms_consent: true,
  appointment_date: "2026-09-12",
  appointment_time: "14:00",
  timezone: "America/Toronto",
  meeting_type: "Phone Call",
  meeting_link: null,
  status: "Booked",
  status_reason: null,
  assigned_specialist_id: null,
  appointment_notes: null,
  client_feedback: null,
  confirmation_sent: true,
  incentive_status: null,
  incentive_status_reason: null,
  incentive_status_set_by: null,
  incentive_status_set_at: null,
  admin_notified_at: null,
  created_by: null,
} as unknown as LeadgenAppointmentRow;

describe("sendManualLeadgenAppointmentSms", () => {
  it("does not attempt a send when automatic SMS reminders are disabled", async () => {
    const { sendManualLeadgenAppointmentSms } = await import("@/lib/leadgen-appointment-reminders");
    const result = await sendManualLeadgenAppointmentSms({} as never, appointment, "resend_confirmation", false);
    expect(result.outcome).toBe("disabled");
    expect(claimAndSendAppointmentSmsMock).not.toHaveBeenCalled();
  });

  it("sends a manual resend confirmation SMS with a fresh, always-unique occurrence key (never dedup'd against the automatic job)", async () => {
    claimAndSendAppointmentSmsMock.mockClear();
    const { sendManualLeadgenAppointmentSms } = await import("@/lib/leadgen-appointment-reminders");
    const result = await sendManualLeadgenAppointmentSms({} as never, appointment, "resend_confirmation", true);

    expect(result.outcome).toBe("sent");
    expect(claimAndSendAppointmentSmsMock).toHaveBeenCalledTimes(1);
    const [, input] = claimAndSendAppointmentSmsMock.mock.calls[0];
    expect(input.recipientType).toBe("prospect");
    expect(input.toPhoneRaw).toBe(appointment.phone);
    expect(input.occurrenceKey).toMatch(/^manual_resend_confirmation:\d+$/);
    expect(input.message).toContain("is confirmed for");
  });

  it("sends a manual reminder SMS distinguishable from the confirmation send", async () => {
    claimAndSendAppointmentSmsMock.mockClear();
    const { sendManualLeadgenAppointmentSms } = await import("@/lib/leadgen-appointment-reminders");
    const result = await sendManualLeadgenAppointmentSms({} as never, appointment, "reminder", true);

    expect(result.outcome).toBe("sent");
    const [, input] = claimAndSendAppointmentSmsMock.mock.calls[0];
    expect(input.occurrenceKey).toMatch(/^manual_reminder:\d+$/);
    expect(input.message).toContain("is in");
  });
});

describe("describeManualSmsOutcome", () => {
  it("omits any message when SMS is disabled", async () => {
    const { describeManualSmsOutcome } = await import("@/lib/leadgen-appointment-reminders");
    expect(describeManualSmsOutcome({ outcome: "disabled" })).toBeNull();
  });

  it("describes a successful send", async () => {
    const { describeManualSmsOutcome } = await import("@/lib/leadgen-appointment-reminders");
    expect(describeManualSmsOutcome({ outcome: "sent" })).toBe("SMS sent.");
  });

  it("includes the failure reason", async () => {
    const { describeManualSmsOutcome } = await import("@/lib/leadgen-appointment-reminders");
    expect(describeManualSmsOutcome({ outcome: "failed", error: "Twilio rejected the number." })).toBe("SMS failed: Twilio rejected the number.");
  });

  it("describes a missing phone number", async () => {
    const { describeManualSmsOutcome } = await import("@/lib/leadgen-appointment-reminders");
    expect(describeManualSmsOutcome({ outcome: "skipped_no_phone" })).toBe("SMS not sent (no phone number on file).");
  });
});
