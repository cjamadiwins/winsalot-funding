import { describe, expect, it } from "vitest";
import {
  businessDaysSince,
  deriveCommunicationMonitoringStatus,
  deriveStaleLeadStatus,
  computeLastMeaningfulActivity,
  deriveAppointmentRiskStatus,
  isPastCallKpiCheckpoint,
  deriveCallKpiPace,
  callKpiPaceMonitoringStatus,
  deriveDataQualityStatus,
  deriveCampaignActivityStatus,
  summarizeOperationsMonitoring,
  worstMonitoringStatus,
  type MonitoringCategorySummary,
} from "../leadgen-monitoring";

describe("businessDaysSince", () => {
  it("returns 0 for today or the future, counts only weekdays otherwise", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    expect(businessDaysSince("2026-06-10T08:00:00Z", now)).toBe(0);
    expect(businessDaysSince("2026-06-05T12:00:00Z", new Date("2026-06-08T12:00:00Z"))).toBe(1);
  });
});

describe("deriveCommunicationMonitoringStatus", () => {
  it("treats 1-2 as informational, 3+ as Warning, 6+ as Action Required", () => {
    expect(deriveCommunicationMonitoringStatus(2)).toBe("Healthy");
    expect(deriveCommunicationMonitoringStatus(3)).toBe("Needs Attention");
    expect(deriveCommunicationMonitoringStatus(6)).toBe("Action Required");
  });
});

describe("deriveStaleLeadStatus", () => {
  it("follows the 2-day / 3-day thresholds", () => {
    expect(deriveStaleLeadStatus(1)).toBe("Healthy");
    expect(deriveStaleLeadStatus(2)).toBe("Needs Attention");
    expect(deriveStaleLeadStatus(3)).toBe("Action Required");
  });
});

describe("computeLastMeaningfulActivity", () => {
  it("picks the latest timestamp, falling back to createdAt", () => {
    expect(computeLastMeaningfulActivity("2026-01-01T00:00:00Z", ["2026-01-05T00:00:00Z", null])).toBe("2026-01-05T00:00:00Z");
    expect(computeLastMeaningfulActivity("2026-01-01T00:00:00Z", [null, null])).toBe("2026-01-01T00:00:00Z");
  });
});

describe("deriveAppointmentRiskStatus", () => {
  it("rolls flags up to the worst severity", () => {
    expect(deriveAppointmentRiskStatus([])).toBe("Healthy");
    expect(deriveAppointmentRiskStatus([{ code: "x", label: "x", severity: "warning" }])).toBe("Needs Attention");
    expect(deriveAppointmentRiskStatus([{ code: "x", label: "x", severity: "action" }])).toBe("Action Required");
  });
});

describe("call KPI pace", () => {
  it("matches the brief's own worked example (39/80 Behind Pace, 67/80 On Track)", () => {
    const afternoon = new Date("2026-06-10T19:00:00Z"); // ~3pm Toronto
    expect(isPastCallKpiCheckpoint(afternoon)).toBe(true);
    expect(deriveCallKpiPace(Math.round((39 / 80) * 100), true)).toBe("Behind Pace");
    expect(deriveCallKpiPace(Math.round((67 / 80) * 100), true)).toBe("On Track");
  });

  it("is Too Early To Tell before the checkpoint", () => {
    const morning = new Date("2026-06-10T13:00:00Z"); // ~9am Toronto
    expect(deriveCallKpiPace(10, isPastCallKpiCheckpoint(morning))).toBe("Too Early To Tell");
  });

  it("maps pace to a monitoring status", () => {
    expect(callKpiPaceMonitoringStatus("Behind Pace")).toBe("Needs Attention");
    expect(callKpiPaceMonitoringStatus("On Track")).toBe("Healthy");
    expect(callKpiPaceMonitoringStatus("Too Early To Tell")).toBe("Healthy");
  });
});

describe("deriveDataQualityStatus", () => {
  it("is Healthy at zero, Needs Attention for a small batch, Action Required for a large one", () => {
    expect(deriveDataQualityStatus(0)).toBe("Healthy");
    expect(deriveDataQualityStatus(5)).toBe("Needs Attention");
    expect(deriveDataQualityStatus(10)).toBe("Action Required");
  });
});

describe("deriveCampaignActivityStatus", () => {
  it("follows the 1-day / 2-day thresholds", () => {
    expect(deriveCampaignActivityStatus(0)).toBe("Healthy");
    expect(deriveCampaignActivityStatus(1)).toBe("Needs Attention");
    expect(deriveCampaignActivityStatus(2)).toBe("Action Required");
  });
});

describe("worstMonitoringStatus / summarizeOperationsMonitoring", () => {
  it("rolls up correctly", () => {
    expect(worstMonitoringStatus(["Healthy", "Action Required", "Needs Attention"])).toBe("Action Required");
    const categories: MonitoringCategorySummary[] = [
      { key: "email_sms", label: "Email/SMS", status: "Healthy", headline: "Healthy", actionRequiredCount: 0, warningCount: 0, healthyCount: 5 },
      { key: "stale_leads", label: "Stale Leads", status: "Action Required", headline: "3", actionRequiredCount: 2, warningCount: 1, healthyCount: 0 },
    ];
    const summary = summarizeOperationsMonitoring(categories);
    expect(summary.totalActionRequired).toBe(2);
    expect(summary.totalWarnings).toBe(1);
    expect(summary.totalHealthy).toBe(5);
  });
});
