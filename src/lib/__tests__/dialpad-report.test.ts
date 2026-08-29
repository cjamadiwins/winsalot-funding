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
    // talk_duration/avg_talk_duration are in fractional minutes in real
    // Dialpad exports, and "handled" (not "answered") is the true total of
    // connected calls - "answered" alone only counts inbound calls answered.
    const parsed = parseDialpadCsv([
      "name,type,all_calls,inbound_calls,outbound_calls,missed,handled,answered,talk_duration,avg_talk_duration",
      "Henry Osuji,user,45,20,25,3,42,10,25.5,0.567",
      "Goodness Ugbana,user,30,15,15,1,29,8,15,0.5",
      "Sales Call Center,callcenter,75,75,0,4,71,20,50,0.667",
    ].join("\n"));

    expect(parsed.summaries).toEqual([
      expect.objectContaining({ agentName: "Henry Osuji", totalCalls: 45, placedCalls: 25, answeredCalls: 42, missedCalls: 3, totalDurationSeconds: 1530, averageDurationSeconds: 34 }),
      expect.objectContaining({ agentName: "Goodness Ugbana", totalCalls: 30, placedCalls: 15, answeredCalls: 29, missedCalls: 1, totalDurationSeconds: 900, averageDurationSeconds: 30 }),
    ]);
    expect(parsed.summaries.some((summary) => summary.agentName === "Sales Call Center")).toBe(false);
  });

  it("maps Dialpad account emails to CRM identities", () => {
    expect(resolveDialpadIdentity("Winsalot Corp.", "Agent@winsalotcorp.com")).toEqual({
      agentName: "Henry Osuji",
      agentEmail: "agent@winsalotcorp.com",
      agentRole: "agent",
    });
    expect(resolveDialpadIdentity("Winsalot Corp.", "Agent2@winsalotcorp.com")).toEqual({
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

  it("aggregates a Dialpad User Statistics export (one row per agent per day) into one summary per agent", () => {
    const parsed = parseDialpadCsv(
      [
        "date,user_id,name,email,type,all_calls,inbound_calls,outbound_calls,missed,handled,answered,talk_duration,avg_talk_duration",
        "2026-08-21,111,Winsalot Corp.,Agent@winsalotcorp.com,user,100,10,90,2,80,10,25,0.31",
        "2026-08-22,,,,,0,0,0,0,0,0,0,0",
        "2026-08-24,111,Winsalot Corp.,Agent@winsalotcorp.com,user,120,8,112,1,95,8,30,0.316",
        "2026-08-24,222,Winsalot Corp.,info@winsalotcorp.com,user,4,2,2,0,4,2,20,5",
      ].join("\n")
    );

    expect(parsed.summaries).toEqual([
      expect.objectContaining({
        agentName: "Henry Osuji",
        agentEmail: "agent@winsalotcorp.com",
        totalCalls: 220,
        placedCalls: 202,
        answeredCalls: 175,
        missedCalls: 3,
        totalDurationSeconds: 3300,
        averageDurationSeconds: 15,
      }),
      expect.objectContaining({
        agentName: "C.J Amadi",
        agentEmail: "info@winsalotcorp.com",
        totalCalls: 4,
        answeredCalls: 4,
        totalDurationSeconds: 1200,
        averageDurationSeconds: 300,
      }),
    ]);
    expect(parsed.summaries).toHaveLength(2);
  });
});
