import { describe, expect, it } from "vitest";
import { formatDialpadDuration, parseDialpadCsv, parseDurationSeconds } from "../dialpad-report";

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
});
