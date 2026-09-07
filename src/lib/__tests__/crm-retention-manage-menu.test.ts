import { describe, expect, it } from "vitest";
import { buildManageItems } from "@/components/crm-retention/AdminRetentionClient";
import type { CrmRetentionEnrollmentRow } from "@/lib/crm-retention-types";

// The Engagement/Retention campaign table replaced six stacked per-row
// buttons with one "Manage ▾" menu (see AdminRetentionClient.tsx). These
// tests pin down that the menu still offers exactly the same actions, in
// the same states, that the old buttons did - no functionality lost in
// the layout change.
function makeEnrollment(overrides: Partial<CrmRetentionEnrollmentRow>): CrmRetentionEnrollmentRow {
  return {
    id: "enr-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    client_id: "client-1",
    campaign_type: "client_success",
    retention_status: "active",
    auto_send: true,
    start_date: "2026-01-01",
    cadence_days: 30,
    next_send_at: null,
    last_sent_at: null,
    send_count: 0,
    re_engagement_started_at: null,
    re_engagement_completed_at: null,
    last_error: null,
    claim_token: null,
    claimed_at: null,
    paused_at: null,
    stopped_at: null,
    removed_at: null,
    created_by: null,
    updated_by: null,
    ...overrides,
  };
}

const noopHandlers = {
  onView: () => {},
  onPause: () => {},
  onResume: () => {},
  onStop: () => {},
  onRemove: () => {},
  onSendNow: () => {},
  onChangeCampaignType: () => {},
};

function visibleKeys(enrollment: CrmRetentionEnrollmentRow, isPending = false) {
  return buildManageItems(enrollment, isPending, noopHandlers)
    .filter((item) => !item.hidden)
    .map((item) => item.key);
}

describe("buildManageItems", () => {
  it("offers View, Pause, Send Now, Email History, Stop, Remove for an active client_success enrollment", () => {
    expect(visibleKeys(makeEnrollment({ campaign_type: "client_success", retention_status: "active" }))).toEqual([
      "view",
      "email-history",
      "send-now",
      "pause",
      "stop",
      "remove",
    ]);
  });

  it("offers Resume instead of Pause/Send Now for a paused enrollment", () => {
    expect(visibleKeys(makeEnrollment({ campaign_type: "re_engagement", retention_status: "paused" }))).toEqual([
      "view",
      "email-history",
      "resume",
      "stop",
      "remove",
    ]);
  });

  it("offers Activate instead of Pause/Send Now for an inactive enrollment", () => {
    expect(visibleKeys(makeEnrollment({ campaign_type: "follow_up", retention_status: "inactive" }))).toEqual([
      "view",
      "email-history",
      "activate",
      "stop",
      "remove",
    ]);
  });

  it("never offers Send Now for a follow_up campaign, even while active", () => {
    expect(visibleKeys(makeEnrollment({ campaign_type: "follow_up", retention_status: "active" }))).not.toContain("send-now");
  });

  it("always keeps View, Email History, Stop, and Remove available regardless of status", () => {
    for (const retention_status of ["active", "paused", "follow_up", "re_engagement", "re_engagement_completed", "inactive", "cancelled"] as const) {
      const keys = visibleKeys(makeEnrollment({ retention_status }));
      expect(keys).toEqual(expect.arrayContaining(["view", "email-history", "stop", "remove"]));
    }
  });

  it("disables the mutating actions while a request is pending, but never View or Email History", () => {
    const items = buildManageItems(makeEnrollment({ retention_status: "active" }), true, noopHandlers);
    const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
    expect(byKey.view.disabled).toBeFalsy();
    expect(byKey["email-history"].disabled).toBeFalsy();
    expect(byKey["send-now"].disabled).toBe(true);
    expect(byKey.pause.disabled).toBe(true);
    expect(byKey.stop.disabled).toBe(true);
    expect(byKey.remove.disabled).toBe(true);
  });
});
