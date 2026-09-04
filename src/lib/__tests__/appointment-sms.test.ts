import { describe, expect, it } from "vitest";
import {
  buildAdminReminderSms,
  buildAppointmentConfirmationSms,
  buildProspectReminderSms,
  formatSmsDateLabel,
  formatSmsTimeLabel,
  isAppointmentToday,
  isValidMobileNumber,
  SMS_START_KEYWORDS,
  SMS_STOP_KEYWORDS,
} from "../appointment-sms";

describe("isValidMobileNumber", () => {
  it("accepts a plain 10-digit NANP number", () => {
    expect(isValidMobileNumber("4165551234")).toBe(true);
  });

  it("accepts a formatted 10-digit number", () => {
    expect(isValidMobileNumber("(416) 555-1234")).toBe(true);
  });

  it("accepts an 11-digit number with a leading 1", () => {
    expect(isValidMobileNumber("14165551234")).toBe(true);
  });

  it("accepts an already-E.164 number", () => {
    expect(isValidMobileNumber("+14165551234")).toBe(true);
  });

  it("rejects null/empty/whitespace", () => {
    expect(isValidMobileNumber(null)).toBe(false);
    expect(isValidMobileNumber(undefined)).toBe(false);
    expect(isValidMobileNumber("")).toBe(false);
    expect(isValidMobileNumber("   ")).toBe(false);
  });

  it("rejects a too-short number", () => {
    expect(isValidMobileNumber("12345")).toBe(false);
  });

  it("rejects an 11-digit number without a leading 1", () => {
    expect(isValidMobileNumber("24165551234")).toBe(false);
  });
});

describe("buildProspectReminderSms", () => {
  it("matches the brief's exact suggested wording for a short name", () => {
    const message = buildProspectReminderSms({ businessName: "Brent's Essentials", reminderType: "24_hour_reminder", timeLabel: "3:00 PM EST" });
    expect(message).toBe("Winsalot Corp.: Your phone call appointment with Brent's Essentials is in 24 hours at 3:00 PM EST. STOP to opt out.");
  });

  it("identifies the 1-hour reminder", () => {
    const message = buildProspectReminderSms({ businessName: "Mantra Collab", reminderType: "1_hour_reminder", timeLabel: "9:30 AM EST" });
    expect(message).toContain("appointment with Mantra Collab is in 1 hour at 9:30 AM EST.");
  });

  it("never exceeds one SMS segment (160 GSM-7 chars)", () => {
    const message = buildProspectReminderSms({
      businessName: "A Very Long Business Name That Would Otherwise Blow Past The Single-Segment Limit For Sure",
      reminderType: "24_hour_reminder",
      timeLabel: "3:00 PM EST",
    });
    expect(message.length).toBeLessThanOrEqual(160);
  });

  it("never truncates the compliance suffix, even for a very long name", () => {
    const message = buildProspectReminderSms({
      businessName: "A".repeat(300),
      reminderType: "1_hour_reminder",
      timeLabel: "3:00 PM EST",
    });
    expect(message.endsWith("STOP to opt out.")).toBe(true);
  });

  it("falls back to a generic label for a blank name", () => {
    const message = buildProspectReminderSms({ businessName: "   ", reminderType: "24_hour_reminder", timeLabel: "3:00 PM EST" });
    expect(message).toContain("your business");
  });
});

describe("buildAppointmentConfirmationSms", () => {
  it("confirms the business, date, time, and opt-out instruction", () => {
    expect(
      buildAppointmentConfirmationSms({
        businessName: "Brent's Essentials",
        dateLabel: "Sep 8",
        timeLabel: "3:00 PM EDT",
      })
    ).toBe("Winsalot Corp.: Your phone call appointment with Brent's Essentials is confirmed for Sep 8 at 3:00 PM EDT. STOP to opt out.");
  });

  it("keeps the complete opt-out suffix within one SMS segment", () => {
    const message = buildAppointmentConfirmationSms({
      businessName: "A".repeat(300),
      dateLabel: "September 30, 2026",
      timeLabel: "11:30 AM EDT",
    });
    expect(message.length).toBeLessThanOrEqual(160);
    expect(message.endsWith("STOP to opt out.")).toBe(true);
  });
});

describe("buildAdminReminderSms", () => {
  it("includes the CRM label, business name, and contact name", () => {
    const message = buildAdminReminderSms({
      crmLabel: "Lead Gen",
      businessName: "Brent's Essentials",
      contactName: "Brent Smith",
      isToday: true,
      timeLabel: "3:00 PM EST",
    });
    expect(message).toContain("Lead Gen");
    expect(message).toContain("Brent's Essentials");
    expect(message).toContain("Brent Smith");
  });

  it("omits the contact suffix when there is no contact name", () => {
    const message = buildAdminReminderSms({
      crmLabel: "Growth",
      businessName: "Acme Co",
      contactName: null,
      isToday: false,
      timeLabel: "9:00 AM EST",
    });
    expect(message).not.toContain("()");
  });

  it("never exceeds one SMS segment", () => {
    const message = buildAdminReminderSms({
      crmLabel: "Lead Gen",
      businessName: "B".repeat(200),
      contactName: "C".repeat(200),
      isToday: false,
      timeLabel: "3:00 PM EST",
    });
    expect(message.length).toBeLessThanOrEqual(160);
  });
});

describe("isAppointmentToday", () => {
  it("is true for the same calendar date in the given timezone", () => {
    const now = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15 12:00 UTC
    const later = Date.UTC(2026, 5, 15, 18, 0, 0); // same UTC day
    expect(isAppointmentToday(later, "America/Toronto", now)).toBe(true);
  });

  it("is false when the appointment falls on a different calendar date in that timezone", () => {
    // America/Toronto is EDT (UTC-4) in June: 2026-06-15 23:50 UTC reads
    // as 2026-06-15 19:50 Toronto, while 2026-06-16 05:00 UTC reads as
    // 2026-06-16 01:00 Toronto - a genuinely different Toronto calendar day.
    const now = Date.UTC(2026, 5, 15, 23, 50, 0);
    const scheduled = Date.UTC(2026, 5, 16, 5, 0, 0);
    expect(isAppointmentToday(scheduled, "America/Toronto", now)).toBe(false);
  });
});

describe("formatSmsTimeLabel", () => {
  it("formats a UTC instant into the given timezone with an hour and short zone name", () => {
    const ms = Date.UTC(2026, 5, 15, 19, 0, 0); // 19:00 UTC
    const label = formatSmsTimeLabel(ms, "America/Toronto");
    expect(label).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)\s*E[DS]T/);
  });
});

describe("formatSmsDateLabel", () => {
  it("formats the appointment date in its own timezone", () => {
    const ms = Date.UTC(2026, 8, 5, 2, 0, 0); // Sep 4 in Toronto
    expect(formatSmsDateLabel(ms, "America/Toronto")).toBe("Sep 4");
  });
});

describe("SMS opt-out keyword sets", () => {
  it("matches Twilio's standard STOP-family keywords, lowercased", () => {
    for (const kw of ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]) {
      expect(SMS_STOP_KEYWORDS.has(kw)).toBe(true);
    }
  });

  it("matches Twilio's standard START-family keywords, lowercased", () => {
    for (const kw of ["start", "unstop", "yes"]) {
      expect(SMS_START_KEYWORDS.has(kw)).toBe(true);
    }
  });

  it("does not treat a normal reply containing 'stop' as an opt-out keyword", () => {
    expect(SMS_STOP_KEYWORDS.has("please stop calling me")).toBe(false);
  });
});
