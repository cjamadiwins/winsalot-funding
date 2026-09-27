import { describe, expect, it } from "vitest";
import {
  businessDaysSince,
  deriveCommunicationMonitoringStatus,
  deriveStaleLeadStatus,
  computeLastMeaningfulActivity,
  deriveAppointmentRiskStatus,
  deriveFollowUpMissingFlag,
  isPastCallKpiCheckpoint,
  expectedCallsByNow,
  deriveCallKpiPace,
  callKpiPaceMonitoringStatus,
  deriveDataQualityStatus,
  deriveClientCampaignStatus,
  summarizeOperationsMonitoring,
  worstMonitoringStatus,
  type MonitoringCategorySummary,
} from "../crm-monitoring";

describe("businessDaysSince", () => {
  it("returns 0 for a date today or in the future", () => {
    const now = new Date("2026-06-10T12:00:00Z"); // Wednesday
    expect(businessDaysSince("2026-06-10T08:00:00Z", now)).toBe(0);
    expect(businessDaysSince("2026-06-11T08:00:00Z", now)).toBe(0);
  });

  it("counts only Monday-Friday between the two dates", () => {
    // Friday -> following Monday is 1 business day (Sat/Sun excluded).
    const friday = "2026-06-05T12:00:00Z";
    const monday = new Date("2026-06-08T12:00:00Z");
    expect(businessDaysSince(friday, monday)).toBe(1);
  });

  it("caps at the given limit for efficiency", () => {
    const longAgo = "2020-01-01T00:00:00Z";
    const now = new Date("2026-06-10T00:00:00Z");
    expect(businessDaysSince(longAgo, now, 5)).toBe(5);
  });
});

describe("deriveCommunicationMonitoringStatus", () => {
  it("treats 1-2 failures as informational only (Healthy)", () => {
    expect(deriveCommunicationMonitoringStatus(0)).toBe("Healthy");
    expect(deriveCommunicationMonitoringStatus(1)).toBe("Healthy");
    expect(deriveCommunicationMonitoringStatus(2)).toBe("Healthy");
  });

  it("flags 3+ as Needs Attention and 6+ as Action Required", () => {
    expect(deriveCommunicationMonitoringStatus(3)).toBe("Needs Attention");
    expect(deriveCommunicationMonitoringStatus(5)).toBe("Needs Attention");
    expect(deriveCommunicationMonitoringStatus(6)).toBe("Action Required");
    expect(deriveCommunicationMonitoringStatus(20)).toBe("Action Required");
  });
});

describe("deriveStaleLeadStatus", () => {
  it("follows the 2-day / 3-day thresholds exactly", () => {
    expect(deriveStaleLeadStatus(0)).toBe("Healthy");
    expect(deriveStaleLeadStatus(1)).toBe("Healthy");
    expect(deriveStaleLeadStatus(2)).toBe("Needs Attention");
    expect(deriveStaleLeadStatus(3)).toBe("Action Required");
    expect(deriveStaleLeadStatus(10)).toBe("Action Required");
  });
});

describe("computeLastMeaningfulActivity", () => {
  it("picks the latest non-null timestamp", () => {
    const result = computeLastMeaningfulActivity("2026-01-01T00:00:00Z", [
      "2026-01-05T00:00:00Z",
      null,
      "2026-01-03T00:00:00Z",
      null,
      "2026-01-02T00:00:00Z",
    ]);
    expect(result).toBe("2026-01-05T00:00:00Z");
  });

  it("falls back to createdAt when nothing else is recorded", () => {
    const result = computeLastMeaningfulActivity("2026-01-01T00:00:00Z", [null, null, null, null, null]);
    expect(result).toBe("2026-01-01T00:00:00Z");
  });
});

describe("deriveAppointmentRiskStatus", () => {
  it("is Healthy with no flags", () => {
    expect(deriveAppointmentRiskStatus([])).toBe("Healthy");
  });
  it("is Needs Attention with only warning flags", () => {
    expect(deriveAppointmentRiskStatus([{ code: "x", label: "x", severity: "warning" }])).toBe("Needs Attention");
  });
  it("is Action Required if any flag is action severity", () => {
    expect(
      deriveAppointmentRiskStatus([
        { code: "a", label: "a", severity: "warning" },
        { code: "b", label: "b", severity: "action" },
      ])
    ).toBe("Action Required");
  });
});

describe("deriveFollowUpMissingFlag", () => {
  it("returns null before 2 business days have passed", () => {
    const now = new Date("2026-06-09T12:00:00Z"); // Tuesday
    expect(deriveFollowUpMissingFlag("2026-06-09T08:00:00Z", now)).toBeNull();
  });
  it("returns a warning flag at 2 business days", () => {
    const completedFriday = "2026-06-05T12:00:00Z";
    const tuesday = new Date("2026-06-09T12:00:00Z"); // Mon+Tue = 2 business days later
    const flag = deriveFollowUpMissingFlag(completedFriday, tuesday);
    expect(flag?.severity).toBe("warning");
  });
  it("returns an action flag at 5+ business days", () => {
    const completedFriday = "2026-05-29T12:00:00Z";
    const followingFriday = new Date("2026-06-05T12:00:00Z"); // 5 business days later
    const flag = deriveFollowUpMissingFlag(completedFriday, followingFriday);
    expect(flag?.severity).toBe("action");
  });
});

describe("call KPI pace", () => {
  it("is Too Early To Tell before the checkpoint hour", () => {
    const morning = new Date("2026-06-10T13:00:00Z"); // ~9am Toronto (EDT, UTC-4)
    expect(isPastCallKpiCheckpoint(morning)).toBe(false);
    expect(deriveCallKpiPace(10, 40, false)).toBe("Too Early To Tell");
  });

  it("is Behind Pace once meaningfully under the pro-rated expectation, past checkpoint", () => {
    const afternoon = new Date("2026-06-10T19:00:00Z"); // ~3pm Toronto (EDT)
    expect(isPastCallKpiCheckpoint(afternoon)).toBe(true);
    expect(deriveCallKpiPace(39, 80, true)).toBe("Behind Pace");
    expect(deriveCallKpiPace(67, 80, true)).toBe("On Track");
  });

  it("maps pace to a monitoring status", () => {
    expect(callKpiPaceMonitoringStatus("Behind Pace")).toBe("Needs Attention");
    expect(callKpiPaceMonitoringStatus("On Track")).toBe("Healthy");
    expect(callKpiPaceMonitoringStatus("Too Early To Tell")).toBe("Healthy");
  });

  it("pro-rates the weekly target across elapsed business days", () => {
    expect(expectedCallsByNow(400, 5, 1)).toBe(80);
    expect(expectedCallsByNow(400, 5, 3)).toBe(240);
    expect(expectedCallsByNow(400, 5, 10)).toBe(400); // never exceeds the full target
    expect(expectedCallsByNow(400, 0, 1)).toBe(0);
  });
});

describe("deriveDataQualityStatus", () => {
  it("is Healthy with zero issues, Needs Attention for a small batch, Action Required for a large one", () => {
    expect(deriveDataQualityStatus(0)).toBe("Healthy");
    expect(deriveDataQualityStatus(1)).toBe("Needs Attention");
    expect(deriveDataQualityStatus(9)).toBe("Needs Attention");
    expect(deriveDataQualityStatus(10)).toBe("Action Required");
  });
});

describe("deriveClientCampaignStatus", () => {
  it("follows the 1-day / 2-day thresholds", () => {
    expect(deriveClientCampaignStatus(0)).toBe("Healthy");
    expect(deriveClientCampaignStatus(1)).toBe("Needs Attention");
    expect(deriveClientCampaignStatus(2)).toBe("Action Required");
  });
});

describe("worstMonitoringStatus", () => {
  it("returns the most severe status in the list", () => {
    expect(worstMonitoringStatus(["Healthy", "Needs Attention", "Healthy"])).toBe("Needs Attention");
    expect(worstMonitoringStatus(["Healthy", "Action Required", "Needs Attention"])).toBe("Action Required");
    expect(worstMonitoringStatus([])).toBe("Healthy");
  });
});

describe("summarizeOperationsMonitoring", () => {
  it("sums each category's counts into the top-line totals", () => {
    const categories: MonitoringCategorySummary[] = [
      { key: "email_sms", label: "Email/SMS", status: "Healthy", headline: "Healthy", actionRequiredCount: 0, warningCount: 0, healthyCount: 5 },
      { key: "stale_leads", label: "Stale Leads", status: "Action Required", headline: "3", actionRequiredCount: 2, warningCount: 1, healthyCount: 4 },
    ];
    const summary = summarizeOperationsMonitoring(categories);
    expect(summary.totalActionRequired).toBe(2);
    expect(summary.totalWarnings).toBe(1);
    expect(summary.totalHealthy).toBe(9);
  });
});
