import { describe, expect, it } from "vitest";
import {
  isClientSuccessSendable,
  isReEngagementSendable,
  isReEngagementSequenceComplete,
  reEngagementNextSendAt,
  templateForRetentionEnrollment,
  RE_ENGAGEMENT_OFFSET_DAYS,
} from "../crm-retention-job";
import type { CrmRetentionTemplateRow } from "../crm-retention-types";

function template(overrides: Partial<CrmRetentionTemplateRow> = {}): CrmRetentionTemplateRow {
  return {
    id: `tmpl-${overrides.sequence_number ?? 1}`,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    campaign_type: "client_success",
    sequence_number: 1,
    label: "Label",
    subject: "Subject",
    body: "Body",
    active: true,
    ...overrides,
  };
}

describe("templateForRetentionEnrollment (resume from the correct next unsent email)", () => {
  const clientSuccessSequence = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => template({ id: `week-${n}`, sequence_number: n }));

  it("rotates through all 8 Client Success templates (two 4-week cycles) before repeating", () => {
    for (let sendCount = 0; sendCount < 8; sendCount++) {
      expect(templateForRetentionEnrollment({ campaign_type: "client_success", send_count: sendCount }, clientSuccessSequence)?.id).toBe(`week-${sendCount + 1}`);
    }
    // Wraps back to week-1 after a full 8-email rotation, never repeating
    // the exact same wording back to back (week-8 -> week-1, not week-4).
    expect(templateForRetentionEnrollment({ campaign_type: "client_success", send_count: 8 }, clientSuccessSequence)?.id).toBe("week-1");
  });

  it("is unaffected by how long a campaign was paused - only send_count matters, not elapsed time", () => {
    expect(templateForRetentionEnrollment({ campaign_type: "client_success", send_count: 2 }, clientSuccessSequence)?.id).toBe("week-3");
  });

  it("ignores deactivated templates and only indexes across the ones still active", () => {
    const withOneDeactivated = [template({ id: "week-1", sequence_number: 1 }), template({ id: "week-2", sequence_number: 2, active: false }), template({ id: "week-3", sequence_number: 3 })];
    expect(templateForRetentionEnrollment({ campaign_type: "client_success", send_count: 1 }, withOneDeactivated)?.id).toBe("week-3");
  });

  it("only considers templates from the enrollment's own campaign_type", () => {
    const mixed = [
      template({ id: "cs-1", sequence_number: 1, campaign_type: "client_success" }),
      template({ id: "re-1", sequence_number: 1, campaign_type: "re_engagement" }),
      template({ id: "re-2", sequence_number: 2, campaign_type: "re_engagement" }),
    ];
    expect(templateForRetentionEnrollment({ campaign_type: "re_engagement", send_count: 0 }, mixed)?.id).toBe("re-1");
    expect(templateForRetentionEnrollment({ campaign_type: "re_engagement", send_count: 1 }, mixed)?.id).toBe("re-2");
  });

  it("returns null when no active template exists for that campaign_type", () => {
    expect(templateForRetentionEnrollment({ campaign_type: "follow_up", send_count: 0 }, clientSuccessSequence)).toBeNull();
    expect(templateForRetentionEnrollment({ campaign_type: "client_success", send_count: 0 }, [])).toBeNull();
  });
});

describe("isClientSuccessSendable / isReEngagementSendable (campaign_type + retention_status gate)", () => {
  it("Client Success only sends while campaign_type is client_success AND status is active", () => {
    expect(isClientSuccessSendable("client_success", "active")).toBe(true);
    expect(isClientSuccessSendable("client_success", "paused")).toBe(false);
    expect(isClientSuccessSendable("re_engagement", "active")).toBe(false);
  });

  it("Re-Engagement only sends while campaign_type is re_engagement AND status is re_engagement", () => {
    expect(isReEngagementSendable("re_engagement", "re_engagement")).toBe(true);
    expect(isReEngagementSendable("re_engagement", "re_engagement_completed")).toBe(false);
    expect(isReEngagementSendable("client_success", "re_engagement")).toBe(false);
  });
});

describe("reEngagementNextSendAt / isReEngagementSequenceComplete (brief: Email 1 day 0, Email 2 +7 days, Email 3 +14 days, then stop)", () => {
  const startedAt = "2026-01-01T00:00:00.000Z";

  it("schedules exactly the brief's default spacing relative to when Re-Engagement started", () => {
    expect(RE_ENGAGEMENT_OFFSET_DAYS).toEqual([0, 7, 14]);
    expect(reEngagementNextSendAt(startedAt, 0)).toBe("2026-01-01T00:00:00.000Z");
    expect(reEngagementNextSendAt(startedAt, 1)).toBe("2026-01-08T00:00:00.000Z");
    expect(reEngagementNextSendAt(startedAt, 2)).toBe("2026-01-15T00:00:00.000Z");
  });

  it("stops scheduling after the 3rd email - never sends a 4th automatically", () => {
    expect(reEngagementNextSendAt(startedAt, 3)).toBeNull();
    expect(isReEngagementSequenceComplete(3)).toBe(true);
    expect(isReEngagementSequenceComplete(2)).toBe(false);
  });
});
