import { describe, expect, it } from "vitest";
import type { CrmLeadEmailRow } from "@/lib/crm-types";
import {
  WINSALOT_APPOINTMENT_TYPES,
  winsalotAppointmentTypeCopyLabel,
  winsalotReminderDisplayStatus,
  winsalotReminderErrorDetail,
  type WinsalotAppointmentReminderRow,
} from "@/lib/winsalot-consultation-types";

const reminder: WinsalotAppointmentReminderRow = {
  id: "reminder-1",
  created_at: "2026-09-11T12:00:00.000Z",
  updated_at: "2026-09-11T12:00:00.000Z",
  appointment_id: "appointment-1",
  reminder_type: "24_hour_reminder",
  occurrence_key: "2026-09-12T12:00:00.000Z",
  scheduled_appointment_at: "2026-09-12T12:00:00.000Z",
  status: "sent",
  recipient_email: "prospect@example.com",
  resend_email_id: "resend-1",
  crm_lead_email_id: "email-1",
  error_detail: null,
  attempt_count: 1,
  sent_at: "2026-09-11T12:00:00.000Z",
};

function trackedEmail(status: CrmLeadEmailRow["status"]): CrmLeadEmailRow {
  return {
    id: "email-1",
    created_at: "2026-09-11T12:00:00.000Z",
    lead_id: null,
    opportunity_id: "opportunity-1",
    agent_id: null,
    activity_id: null,
    resend_email_id: "resend-1",
    email_type: "appointment_reminder",
    to_email: "prospect@example.com",
    subject: "Appointment reminder",
    status,
    status_at: "2026-09-11T12:00:00.000Z",
    sent_at: "2026-09-11T12:00:00.000Z",
    delivered_at: null,
    delayed_at: null,
    bounced_at: null,
    complained_at: null,
    opened_at: null,
    clicked_at: null,
    failed_at: null,
    bounce_reason: null,
    failure_reason: null,
  };
}

describe("Growth CRM appointment reminder display status", () => {
  it("distinguishes a future scheduled reminder from an ineligible appointment", () => {
    expect(winsalotReminderDisplayStatus(null, null, true)).toBe("Scheduled");
    expect(winsalotReminderDisplayStatus(null, null, false)).toBe("Not scheduled");
  });

  it("shows the initial send result and the later Resend delivery result", () => {
    expect(winsalotReminderDisplayStatus(reminder, trackedEmail("sent"), true)).toBe("Sent");
    expect(winsalotReminderDisplayStatus(reminder, trackedEmail("delivered"), true)).toBe("Delivered");
    expect(winsalotReminderDisplayStatus(reminder, trackedEmail("opened"), true)).toBe("Sent");
  });

  it("shows failures and their provider details", () => {
    const failedEmail = { ...trackedEmail("failed"), failure_reason: "Mailbox unavailable" };
    expect(winsalotReminderDisplayStatus(reminder, failedEmail, true)).toBe("Failed");
    expect(winsalotReminderErrorDetail(reminder, failedEmail)).toBe("Mailbox unavailable");

    const bouncedEmail = { ...trackedEmail("bounced"), bounce_reason: "Address rejected" };
    expect(winsalotReminderDisplayStatus(reminder, bouncedEmail, true)).toBe("Bounced");
    expect(winsalotReminderErrorDetail(reminder, bouncedEmail)).toBe("Address rejected");
  });
});

describe("Growth CRM appointment type", () => {
  it("offers Phone Call as an available appointment type", () => {
    expect(WINSALOT_APPOINTMENT_TYPES).toContain("Phone Call");
  });

  it("describes a Phone Call appointment correctly for confirmation/reminder copy", () => {
    expect(winsalotAppointmentTypeCopyLabel("Phone Call")).toBe("phone call appointment");
  });
});
