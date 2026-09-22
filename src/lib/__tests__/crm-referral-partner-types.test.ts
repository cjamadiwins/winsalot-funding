import { describe, expect, it } from "vitest";
import { isReferralPartner, summarizeReferralPartnerFinancials } from "@/lib/crm-subcontractor-types";

// Covers the Growth CRM Referral Partner pure logic (migration
// 20260922120000): the partner-type predicate and the derived financial
// summary (Referrals/Active Clients/MRR/Partner Share/Winsalot Share/Total
// Revenue) shown on a referral partner's profile - built entirely from
// their revenue-share and lending-referral ledger rows, mirroring
// crm-subcontractor-types.test.ts's coverage of the Contractor checklist.

describe("isReferralPartner", () => {
  it("is true only for partner_type = 'referral_partner'", () => {
    expect(isReferralPartner({ partner_type: "referral_partner" })).toBe(true);
    expect(isReferralPartner({ partner_type: "contractor" })).toBe(false);
  });
});

describe("summarizeReferralPartnerFinancials", () => {
  it("returns all zeros with no ledger rows", () => {
    expect(summarizeReferralPartnerFinancials([], [])).toEqual({
      monthlyRecurringRevenue: 0,
      totalRevenueGenerated: 0,
      partnerShareTotal: 0,
      winsalotShareTotal: 0,
    });
  });

  it("uses only the most recent period's monthly_amount per client for MRR - Tony's own worked example ($750/month, 40%/60%)", () => {
    const summary = summarizeReferralPartnerFinancials(
      [
        { client_id: "client-1", period_start: "2026-07-01", monthly_amount: 700, amount_collected: 700, partner_share: 280, winsalot_share: 420 },
        { client_id: "client-1", period_start: "2026-08-01", monthly_amount: 750, amount_collected: 750, partner_share: 300, winsalot_share: 450 },
      ],
      []
    );

    // Only August's $750 counts toward MRR, not July's $700 too - a sum
    // across periods would double-count the same client's ongoing account.
    expect(summary.monthlyRecurringRevenue).toBe(750);
    expect(summary.totalRevenueGenerated).toBe(1450);
    expect(summary.partnerShareTotal).toBe(580);
    expect(summary.winsalotShareTotal).toBe(870);
  });

  it("excludes an unpaid period's amount_collected/partner_share from totals (never calculated on unpaid invoices)", () => {
    const summary = summarizeReferralPartnerFinancials(
      [{ client_id: "client-1", period_start: "2026-09-01", monthly_amount: 750, amount_collected: 0, partner_share: 0, winsalot_share: 0 }],
      []
    );
    expect(summary.totalRevenueGenerated).toBe(0);
    expect(summary.partnerShareTotal).toBe(0);
  });

  it("nets a lending referral's clawback_adjustment out of Total Revenue Generated - Tony's own worked example ($2,000 commission, 40%/60%)", () => {
    const summary = summarizeReferralPartnerFinancials(
      [],
      [{ lender_commission_received: 2000, clawback_adjustment: 0, partner_share: 800, winsalot_share: 1200 }]
    );
    expect(summary.totalRevenueGenerated).toBe(2000);
    expect(summary.partnerShareTotal).toBe(800);
    expect(summary.winsalotShareTotal).toBe(1200);
  });

  it("floors a lending deal's net commission at zero when a clawback exceeds what was received", () => {
    const summary = summarizeReferralPartnerFinancials(
      [],
      [{ lender_commission_received: 500, clawback_adjustment: 600, partner_share: 0, winsalot_share: 0 }]
    );
    expect(summary.totalRevenueGenerated).toBe(0);
  });

  it("combines Lead Generation and Business Lending totals together", () => {
    const summary = summarizeReferralPartnerFinancials(
      [{ client_id: "client-1", period_start: "2026-09-01", monthly_amount: 750, amount_collected: 750, partner_share: 300, winsalot_share: 450 }],
      [{ lender_commission_received: 2000, clawback_adjustment: 0, partner_share: 800, winsalot_share: 1200 }]
    );
    expect(summary.totalRevenueGenerated).toBe(2750);
    expect(summary.partnerShareTotal).toBe(1100);
    expect(summary.winsalotShareTotal).toBe(1650);
  });
});
