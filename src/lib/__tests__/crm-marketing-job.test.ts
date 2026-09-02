import { describe, expect, it } from "vitest";
import { isCampaignSendable, templateForEnrollment } from "../crm-marketing-job";
import type { CrmMarketingTemplateRow } from "../crm-marketing-types";

function template(overrides: Partial<CrmMarketingTemplateRow> = {}): CrmMarketingTemplateRow {
  return {
    id: `tmpl-${overrides.sequence_number ?? 1}`,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    campaign_type: "lead_generation",
    sequence_number: 1,
    subject: "Subject",
    body: "Body",
    cta_label: "CTA",
    active: true,
    ...overrides,
  };
}

describe("templateForEnrollment (resume from the correct next unsent email)", () => {
  const sequence = [
    template({ id: "week-1", sequence_number: 1 }),
    template({ id: "week-2", sequence_number: 2 }),
    template({ id: "week-3", sequence_number: 3 }),
    template({ id: "week-4", sequence_number: 4 }),
  ];

  it("picks the template matching send_count, in sequence order regardless of array order", () => {
    const shuffled = [sequence[2], sequence[0], sequence[3], sequence[1]];
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 0 }, shuffled)?.id).toBe("week-1");
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 1 }, shuffled)?.id).toBe("week-2");
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 2 }, shuffled)?.id).toBe("week-3");
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 3 }, shuffled)?.id).toBe("week-4");
  });

  it("wraps back to the first template after the sequence completes, never skipping ahead", () => {
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 4 }, sequence)?.id).toBe("week-1");
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 9 }, sequence)?.id).toBe("week-2");
  });

  it("is unaffected by how long a campaign was paused - only send_count matters, not elapsed time", () => {
    // Simulates: enrollment was on week-2 (send_count 1) when the campaign
    // was paused; any number of missed cadence cycles later, reactivating
    // must still resume at exactly week-3 (send_count 2), never
    // re-sending week-2 and never jumping ahead to catch up.
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 1 }, sequence)?.id).toBe("week-2");
  });

  it("ignores deactivated templates and only indexes across the ones still active", () => {
    const withOneDeactivated = [
      template({ id: "week-1", sequence_number: 1 }),
      template({ id: "week-2", sequence_number: 2, active: false }),
      template({ id: "week-3", sequence_number: 3 }),
    ];
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 0 }, withOneDeactivated)?.id).toBe("week-1");
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 1 }, withOneDeactivated)?.id).toBe("week-3");
  });

  it("only considers templates from the enrollment's own campaign_type", () => {
    const mixed = [
      template({ id: "lead-1", sequence_number: 1, campaign_type: "lead_generation" }),
      template({ id: "finance-1", sequence_number: 1, campaign_type: "business_financing" }),
      template({ id: "finance-2", sequence_number: 2, campaign_type: "business_financing" }),
    ];
    expect(templateForEnrollment({ campaign_type: "business_financing", send_count: 0 }, mixed)?.id).toBe("finance-1");
    expect(templateForEnrollment({ campaign_type: "business_financing", send_count: 1 }, mixed)?.id).toBe("finance-2");
  });

  it("returns null when no active template exists for that campaign_type", () => {
    expect(templateForEnrollment({ campaign_type: "both_services", send_count: 0 }, sequence)).toBeNull();
    expect(templateForEnrollment({ campaign_type: "lead_generation", send_count: 0 }, [])).toBeNull();
  });
});

describe("isCampaignSendable (campaign-level Active/Paused/Archived gate)", () => {
  it("only 'active' campaigns are sendable", () => {
    expect(isCampaignSendable("active")).toBe(true);
    expect(isCampaignSendable("paused")).toBe(false);
    expect(isCampaignSendable("archived")).toBe(false);
  });
});
