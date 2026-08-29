import { describe, expect, it } from "vitest";
import {
  formatDialpadDuration,
  parseDialpadCsv,
  parseDurationSeconds,
  resolveDialpadIdentity,
} from "../dialpad-report";

describe("Dialpad report parser", () => {
  it("parses user statistics exports", () => {
    const parsed = parseDialpadCsv([
      "User,Calls,Total Duration,Avg. Duration,Placed,Answered,Missed",
      '"Admin User",158,27m 14s,15s,109,40,9',
      '"Agent One",102,28m 24s,22s,79,2,21',
    ].join("\n"));

    expect(parsed.calls).toHaveLength(0);
    expect(parsed.summaries).toEqual([
      expect.objectContaining({ agentName: "Admin User", totalCalls: 158, placedCalls: 109, answeredCalls: 40, missedCalls: 9, totalDurationSeconds: 1634 }),
      expect.objectContaining({ agentName: "Agent One", totalCalls: 102, placedCalls: 79, answeredCalls: 2, missedCalls: 21, totalDurationSeconds: 1704 }),
    ]);
  });

  it("aggregates detailed call logs by user", () => {
    const parsed = parseDialpadCsv([
      "User,Email,Direction,Status,Duration,Start Time,Phone Number,Call ID",
      "Agent One,agent@example.com,Outbound,Connected,1:30,2026-08-24 09:00,+14165550001,c1",
      "Agent One,agent@example.com,Outbound,No answer,0:00,2026-08-24 09:05,+14165550002,c2",
    ].join("\n"));

    expect(parsed.calls).toHaveLength(2);
    expect(parsed.summaries[0]).toEqual(expect.objectContaining({ totalCalls: 2, placedCalls: 2, answeredCalls: 1, missedCalls: 1, totalDurationSeconds: 90 }));
  });

  it("parses and formats common durations", () => {
    expect(parseDurationSeconds("1:02:03")).toBe(3723);
    expect(parseDurationSeconds("27m 14s")).toBe(1634);
    expect(formatDialpadDuration(1634)).toBe("27m 14s");
  });

  it("parses a Dialpad Group Statistics export and excludes non-agent rows", () => {
    const parsed = parseDialpadCsv([
      "name,type,all_calls,inbound_calls,outbound_calls,missed,answered,talk_duration,avg_talk_duration",
      "Henry Osuji,user,45,20,25,3,42,5400,120",
      "Goodness Ugbana,user,30,15,15,1,29,3000,100",
      "Sales Call Center,callcenter,75,75,0,4,71,8400,112",
    ].join("\n"));

    expect(parsed.summaries).toEqual([
      expect.objectContaining({ agentName: "Henry Osuji", totalCalls: 45, placedCalls: 25, answeredCalls: 42, missedCalls: 3, totalDurationSeconds: 5400, averageDurationSeconds: 120 }),
      expect.objectContaining({ agentName: "Goodness Ugbana", totalCalls: 30, placedCalls: 15, answeredCalls: 29, missedCalls: 1, totalDurationSeconds: 3000, averageDurationSeconds: 100 }),
    ]);
    expect(parsed.summaries.some((summary) => summary.agentName === "Sales Call Center")).toBe(false);
  });

  it("maps Dialpad account emails to CRM identities", () => {
    expect(resolveDialpadIdentity("Agent 1", "Agent1@winsalotcorp.com")).toEqual({
      agentName: "Henry Osuji",
      agentEmail: "agent1@winsalotcorp.com",
      agentRole: "agent",
    });
    expect(resolveDialpadIdentity("Agent 2", "Agent2@winsalotcorp.com")).toEqual({
      agentName: "Goodness Ugbana",
      agentEmail: "agent2@winsalotcorp.com",
      agentRole: "agent",
    });
    expect(resolveDialpadIdentity("Winsalot Corp.", "info@winsalotcorp.com")).toEqual({
      agentName: "C.J Amadi",
      agentEmail: "info@winsalotcorp.com",
      agentRole: "admin",
    });
  });
});
