import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function fakeSupabase(tables: Record<string, unknown>) {
  return {
    from: (table: string) => {
      const rows = tables[table];
      if (rows === undefined) throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          in: (_col: string, _ids: string[]) => ({
            order: async () => ({ data: rows }),
          }),
          eq: () => ({
            in: async () => ({ data: rows }),
          }),
        }),
      };
    },
  };
}

describe("fetchLeadgenImmediateConfirmationStatusMap", () => {
  it("picks the earliest email addressed to the prospect as the confirmation, ignoring admin/client emails and later resends", async () => {
    const { fetchLeadgenImmediateConfirmationStatusMap } = await import("@/lib/leadgen-appointment-reminders");
    const supabase = fakeSupabase({
      leadgen_emails: [
        { id: "e-admin", appointment_id: "appt-1", to_email: "admin@winsalotcorp.com", status: "sent", created_at: "2026-09-10T12:00:00.000Z" },
        { id: "e-confirmation", appointment_id: "appt-1", to_email: "prospect@example.com", status: "delivered", created_at: "2026-09-10T12:00:01.000Z" },
        { id: "e-resend", appointment_id: "appt-1", to_email: "prospect@example.com", status: "sent", created_at: "2026-09-11T09:00:00.000Z" },
      ],
    });

    const result = await fetchLeadgenImmediateConfirmationStatusMap(supabase as never, [
      { id: "appt-1", email: "prospect@example.com", confirmation_sent: true },
    ]);

    expect(result["appt-1"]).toEqual({ status: "Delivered", errorDetail: null });
  });

  it("falls back to confirmation_sent when no tracked email row is found", async () => {
    const { fetchLeadgenImmediateConfirmationStatusMap } = await import("@/lib/leadgen-appointment-reminders");
    const supabase = fakeSupabase({ leadgen_emails: [] });

    const sent = await fetchLeadgenImmediateConfirmationStatusMap(supabase as never, [{ id: "appt-2", email: "prospect@example.com", confirmation_sent: true }]);
    expect(sent["appt-2"]).toEqual({ status: "Sent", errorDetail: null });

    const notSent = await fetchLeadgenImmediateConfirmationStatusMap(supabase as never, [{ id: "appt-3", email: null, confirmation_sent: false }]);
    expect(notSent["appt-3"]).toEqual({ status: "Not scheduled", errorDetail: null });
  });

  it("surfaces the bounce/failure reason", async () => {
    const { fetchLeadgenImmediateConfirmationStatusMap } = await import("@/lib/leadgen-appointment-reminders");
    const supabase = fakeSupabase({
      leadgen_emails: [
        { id: "e-1", appointment_id: "appt-4", to_email: "prospect@example.com", status: "bounced", bounce_reason: "Mailbox full", created_at: "2026-09-10T12:00:00.000Z" },
      ],
    });

    const result = await fetchLeadgenImmediateConfirmationStatusMap(supabase as never, [
      { id: "appt-4", email: "prospect@example.com", confirmation_sent: true },
    ]);
    expect(result["appt-4"]).toEqual({ status: "Bounced", errorDetail: "Mailbox full" });
  });
});

describe("fetchLeadgenImmediateSmsConfirmationStatusMap", () => {
  it("matches the booking_confirmation occurrence key and reports Delivered", async () => {
    const { fetchLeadgenImmediateSmsConfirmationStatusMap, zonedWallTimeToUtcMs } = await import("@/lib/leadgen-appointment-reminders");
    const appt = { id: "appt-1", appointment_date: "2026-09-12", appointment_time: "14:00", timezone: "America/Toronto" };
    const occurrenceKey = `booking_confirmation:${new Date(zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone)).toISOString()}`;

    const supabase = fakeSupabase({
      leadgen_appointment_sms_reminders: [{ appointment_id: "appt-1", recipient_type: "prospect", occurrence_key: occurrenceKey, status: "delivered", error_detail: null }],
    });

    const result = await fetchLeadgenImmediateSmsConfirmationStatusMap(supabase as never, [appt]);
    expect(result["appt-1"]).toEqual({ status: "Delivered", errorDetail: null });
  });

  it("reports Not scheduled (never Scheduled) when no row exists yet", async () => {
    const { fetchLeadgenImmediateSmsConfirmationStatusMap } = await import("@/lib/leadgen-appointment-reminders");
    const supabase = fakeSupabase({ leadgen_appointment_sms_reminders: [] });

    const result = await fetchLeadgenImmediateSmsConfirmationStatusMap(supabase as never, [
      { id: "appt-2", appointment_date: "2026-09-12", appointment_time: "14:00", timezone: "America/Toronto" },
    ]);
    expect(result["appt-2"]).toEqual({ status: "Not scheduled", errorDetail: null });
  });

  it("surfaces the skip reason", async () => {
    const { fetchLeadgenImmediateSmsConfirmationStatusMap, zonedWallTimeToUtcMs } = await import("@/lib/leadgen-appointment-reminders");
    const appt = { id: "appt-3", appointment_date: "2026-09-12", appointment_time: "14:00", timezone: "America/Toronto" };
    const occurrenceKey = `booking_confirmation:${new Date(zonedWallTimeToUtcMs(appt.appointment_date, appt.appointment_time, appt.timezone)).toISOString()}`;

    const supabase = fakeSupabase({
      leadgen_appointment_sms_reminders: [
        { appointment_id: "appt-3", recipient_type: "prospect", occurrence_key: occurrenceKey, status: "skipped", error_detail: "No mobile number on file." },
      ],
    });

    const result = await fetchLeadgenImmediateSmsConfirmationStatusMap(supabase as never, [appt]);
    expect(result["appt-3"]).toEqual({ status: "Skipped", errorDetail: "No mobile number on file." });
  });
});
