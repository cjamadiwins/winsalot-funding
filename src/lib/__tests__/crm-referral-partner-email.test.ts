import { describe, expect, it } from "vitest";
import { buildPartnerOverviewEmailDraft } from "@/lib/crm-referral-partner-email";

// Covers buildPartnerOverviewEmailDraft's pure draft generation (never
// sent itself - see that module's header comment). The worked examples in
// the brief (Tony: 40%/60%, $750/$300/$450 Lead Gen, $2,000/$800/$1,200
// Business Lending) must come out exactly right, and a different
// partner's own saved percentages must produce their own correct numbers,
// not Tony's.

describe("buildPartnerOverviewEmailDraft", () => {
  it("matches the brief's worked examples for a 40%/60% partner (Tony)", () => {
    const draft = buildPartnerOverviewEmailDraft({ full_name: "Tony", lead_gen_revenue_share_percent: 40, lending_commission_share_percent: 40 });

    expect(draft.subject).toBe("Winsalot Corp. Partnership Overview & Referral Structure");
    expect(draft.body).toContain("Tony: 40%");
    expect(draft.body).toContain("Winsalot Corp.: 60%");
    expect(draft.body).toContain("Tony receives: $300");
    expect(draft.body).toContain("Winsalot Corp. receives: $450");
    expect(draft.body).toContain("Tony receives: $800");
    expect(draft.body).toContain("Winsalot Corp. receives: $1,200");
    expect(draft.body).toContain("Hi Tony,");
    expect(draft.body).toContain("C.J. Amadi");
    expect(draft.body).not.toContain("profit sharing");
  });

  it("computes a different partner's own percentages, not Tony's hardcoded 40/60", () => {
    const draft = buildPartnerOverviewEmailDraft({ full_name: "Dana Lee", lead_gen_revenue_share_percent: 25, lending_commission_share_percent: 50 });

    expect(draft.body).toContain("Dana: 25%");
    expect(draft.body).toContain("Winsalot Corp.: 75%");
    expect(draft.body).toContain("Dana receives: $188");
    expect(draft.body).toContain("Dana: 50% of the net lender commission");
    expect(draft.body).toContain("Dana receives: $1,000");
  });

  it("defaults to 40% when a partner's percentages have not been set yet", () => {
    const draft = buildPartnerOverviewEmailDraft({ full_name: "New Partner", lead_gen_revenue_share_percent: null, lending_commission_share_percent: null });
    expect(draft.body).toContain("New: 40%");
  });
});
