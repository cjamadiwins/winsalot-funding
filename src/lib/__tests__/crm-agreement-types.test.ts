import { describe, expect, it } from "vitest";
import {
  buildAgreementTargetStatement,
  buildPilotFeesStatement,
  buildPilotServicesStatement,
  renderAgreementTemplate,
  deriveCrmOnboardingStage,
  deriveCrmPilotStage,
  findIntakeAgreementConflicts,
  agreedTargetLabel,
  isAgreementLocked,
  isPaidPilot,
  pilotTotalCost,
  pilotProgramLabel,
  signedAgreementNotificationTitle,
  intakeSubmittedNotificationTitle,
  PILOT_PROGRAM_DISCLOSURE,
  COMPLIMENTARY_PILOT_PROGRAM_LABEL,
  PAID_PILOT_PROGRAM_LABEL,
  type CrmAgreementTemplateRow,
} from "../crm-agreement-types";

// Shared base for renderAgreementTemplate's widened second argument -
// every test below spreads this and overrides only what it's testing, so
// adding a new pilot/fee field to the function's signature only ever
// needs updating here once.
const standardBase = {
  campaign_type: "standard_monthly" as const,
  pilot_type: "free" as const,
  service_type: "qualified_leads" as const,
  monthly_fee: 500,
  setup_fee: null,
  currency: "CAD" as const,
};
const freePilotBase = { ...standardBase, campaign_type: "free_pilot" as const, monthly_fee: 0, setup_fee: 0 };
const paidPilotBase = { ...standardBase, campaign_type: "free_pilot" as const, pilot_type: "paid" as const, monthly_fee: 1200, setup_fee: 300 };

describe("buildAgreementTargetStatement", () => {
  it("uses 'target' and 'leads' by default", () => {
    expect(
      buildAgreementTargetStatement({ service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 25 })
    ).toBe(
      "Winsalot Corp will target 25 qualified leads per month. Results may vary based on market conditions, prospect availability, targeting criteria and the client's responsiveness. Winsalot Corp does not guarantee that a lead or appointment will result in a sale."
    );
  });

  it("uses 'consultation appointments' for that service type", () => {
    expect(
      buildAgreementTargetStatement({ service_type: "consultation_appointments", target_type: "monthly_target", monthly_target: 10 })
    ).toContain("target 10 qualified consultation appointments per month");
  });

  it("uses 'guarantee' only when target_type is deliberately 'guaranteed'", () => {
    expect(
      buildAgreementTargetStatement({ service_type: "qualified_leads", target_type: "guaranteed", monthly_target: 25 })
    ).toContain("Winsalot Corp will guarantee 25 qualified leads per month");
  });

  it("always includes the no-guarantee-of-sales disclosure, regardless of target_type", () => {
    const text = buildAgreementTargetStatement({ service_type: "qualified_leads", target_type: "guaranteed", monthly_target: 5 });
    expect(text).toContain("Winsalot Corp does not guarantee that a lead or appointment will result in a sale.");
  });
});

describe("renderAgreementTemplate", () => {
  const template: Pick<CrmAgreementTemplateRow, "content"> = {
    content: [
      { key: "definition", title: "Definition of a Qualified {{service_noun_singular}}", body: "A qualified {{service_noun_singular}} is..." },
      { key: "monthly_target", title: "Monthly Target", body: "placeholder - replaced verbatim" },
    ],
  };

  it("substitutes placeholders in titles and bodies", () => {
    const rendered = renderAgreementTemplate(template, { ...standardBase, service_type: "consultation_appointments", target_type: "monthly_target", monthly_target: 8 });
    expect(rendered[0].title).toBe("Definition of a Qualified appointment");
    expect(rendered[0].body).toBe("A qualified appointment is...");
  });

  it("replaces the monthly_target section's body with the exact required statement, not just token substitution", () => {
    const rendered = renderAgreementTemplate(template, { ...standardBase, service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 15 });
    expect(rendered[1].body).toBe(buildAgreementTargetStatement({ service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 15 }));
  });

  it("never dynamically overrides a standard (non-pilot) agreement's own 'fees' section", () => {
    const feesTemplate: Pick<CrmAgreementTemplateRow, "content"> = {
      content: [{ key: "fees", title: "Fees and Payment Terms", body: "The Client will pay the monthly fee and setup fee set out in this Agreement." }],
    };
    const rendered = renderAgreementTemplate(feesTemplate, { ...standardBase, service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 15 });
    expect(rendered[0].title).toBe("Fees and Payment Terms");
    expect(rendered[0].body).toBe("The Client will pay the monthly fee and setup fee set out in this Agreement.");
  });

  it("always replaces a pilot's 'fees' section dynamically, regardless of the template's own stored body", () => {
    const feesTemplate: Pick<CrmAgreementTemplateRow, "content"> = {
      content: [{ key: "fees", title: "Fees", body: "This pilot program is provided at no charge to the Client. Pilot Fee: $0. Setup Fee: $0." }],
    };
    const rendered = renderAgreementTemplate(feesTemplate, { ...paidPilotBase, service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 15 });
    expect(rendered[0].title).toBe("Pilot Fees");
    expect(rendered[0].body).toBe(buildPilotFeesStatement(paidPilotBase));
    expect(rendered[0].body).not.toContain("$0");
  });

  it("always replaces a pilot's 'services' section dynamically, so a Paid Pilot never inherits the stale 'complimentary' claim", () => {
    const servicesTemplate: Pick<CrmAgreementTemplateRow, "content"> = {
      content: [{ key: "services", title: "Pilot Program Scope", body: "Winsalot Corp will provide a complimentary, time-limited pilot program..." }],
    };
    const rendered = renderAgreementTemplate(servicesTemplate, { ...paidPilotBase, service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 15 });
    expect(rendered[0].body).toBe(buildPilotServicesStatement(paidPilotBase));
    expect(rendered[0].body.toLowerCase()).not.toContain("complimentary");
  });
});

describe("buildPilotServicesStatement", () => {
  it("calls a Free Pilot complimentary", () => {
    expect(buildPilotServicesStatement(freePilotBase)).toContain("a complimentary, time-limited pilot program");
  });
  it("never calls a Paid Pilot complimentary", () => {
    const body = buildPilotServicesStatement(paidPilotBase);
    expect(body).toContain("a time-limited pilot program");
    expect(body.toLowerCase()).not.toContain("complimentary");
  });
});

describe("agreedTargetLabel", () => {
  it("labels qualified_leads correctly", () => {
    expect(agreedTargetLabel("qualified_leads")).toBe("Agreed Qualified Leads Per Month");
  });
  it("labels consultation_appointments correctly", () => {
    expect(agreedTargetLabel("consultation_appointments")).toBe("Agreed Consultation Appointments Per Month");
  });
  it("drops 'Per Month' wording for a free pilot's target", () => {
    expect(agreedTargetLabel("qualified_leads", "free_pilot")).toBe("Agreed Qualified Leads (Pilot Target)");
    expect(agreedTargetLabel("consultation_appointments", "free_pilot")).toBe("Agreed Consultation Appointments (Pilot Target)");
  });
  it("standard_monthly explicitly behaves the same as the default", () => {
    expect(agreedTargetLabel("qualified_leads", "standard_monthly")).toBe("Agreed Qualified Leads Per Month");
  });
});

describe("pilot template rendering", () => {
  it("carries the exact required disclosure paragraph through verbatim, and it never claims every pilot is free", () => {
    const pilotTemplate: Pick<CrmAgreementTemplateRow, "content"> = {
      content: [{ key: "pilot_disclosure", title: "Pilot Terms and No Guarantee", body: PILOT_PROGRAM_DISCLOSURE }],
    };
    const rendered = renderAgreementTemplate(pilotTemplate, { ...freePilotBase, service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 20 });
    expect(rendered[0].body).toBe(PILOT_PROGRAM_DISCLOSURE);
    expect(rendered[0].body).toContain("Winsalot Corp will provide the pilot services for the agreed period, scope, target market, and deliverables.");
    expect(rendered[0].body).toContain("A pilot program is intended to test campaign performance and service fit.");
    expect(rendered[0].body).toContain("Winsalot Corp does not guarantee a specific number of sales, closed deals, revenue, funding approvals, or customer conversions");
    expect(rendered[0].body).toContain("Where the pilot includes a defined target number of leads or appointments, Winsalot Corp will work toward that agreed target during the pilot period.");
    expect(rendered[0].body).toContain("both parties may review the results and decide whether to continue, extend, modify, or end the service.");
    // Never says every pilot is free/at no charge - it must read the same
    // for a Free Pilot and a Paid Pilot alike (spec: "Update the existing
    // pilot disclosure so it works for BOTH free and paid pilots").
    expect(rendered[0].body.toLowerCase()).not.toContain("no charge");
    expect(rendered[0].body.toLowerCase()).not.toContain("free");
  });

  it("renders identically for a Free Pilot and a Paid Pilot - the disclosure never depends on pilot_type", () => {
    const pilotTemplate: Pick<CrmAgreementTemplateRow, "content"> = {
      content: [{ key: "pilot_disclosure", title: "Pilot Terms and No Guarantee", body: PILOT_PROGRAM_DISCLOSURE }],
    };
    const freeRendered = renderAgreementTemplate(pilotTemplate, { ...freePilotBase, service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 20 });
    const paidRendered = renderAgreementTemplate(pilotTemplate, { ...paidPilotBase, service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 20 });
    expect(freeRendered[0].body).toBe(paidRendered[0].body);
  });
});

describe("isPaidPilot", () => {
  it("is true only for a free_pilot agreement whose pilot_type is 'paid'", () => {
    expect(isPaidPilot(paidPilotBase)).toBe(true);
    expect(isPaidPilot(freePilotBase)).toBe(false);
    expect(isPaidPilot({ campaign_type: "standard_monthly", pilot_type: "paid" })).toBe(false);
  });
});

describe("pilotTotalCost", () => {
  it("adds the pilot fee and setup fee", () => {
    expect(pilotTotalCost({ monthly_fee: 1200, setup_fee: 300 })).toBe(1500);
  });
  it("treats a null setup fee as zero", () => {
    expect(pilotTotalCost({ monthly_fee: 500, setup_fee: null })).toBe(500);
  });
});

describe("pilotProgramLabel", () => {
  it("labels a Free Pilot as complimentary and a Paid Pilot as paid", () => {
    expect(pilotProgramLabel({ pilot_type: "free" })).toBe(COMPLIMENTARY_PILOT_PROGRAM_LABEL);
    expect(pilotProgramLabel({ pilot_type: "paid" })).toBe(PAID_PILOT_PROGRAM_LABEL);
  });
});

describe("buildPilotFeesStatement", () => {
  it("Free Pilot wording shows $0 pilot fee and any real setup fee", () => {
    const body = buildPilotFeesStatement(freePilotBase);
    expect(body).toContain("This pilot program is being provided at no charge for the agreed pilot scope and period.");
    expect(body).toContain("Pilot Fee: $0");
    expect(body).toContain("Setup Fee: $0");
  });

  it("Paid Pilot wording shows the actual amount, total, and currency - never $0", () => {
    const body = buildPilotFeesStatement(paidPilotBase);
    expect(body).toContain("This is a paid pilot program.");
    expect(body).toContain("Pilot Fee: $1,200");
    expect(body).toContain("Setup Fee: $300");
    expect(body).toContain("Total Pilot Cost: $1,500");
    expect(body).toContain("Currency: CAD");
    expect(body).not.toContain("$0");
  });

  it("a Paid Pilot with no setup fee still shows a total equal to just the pilot fee", () => {
    const body = buildPilotFeesStatement({ ...paidPilotBase, setup_fee: null });
    expect(body).toContain("Setup Fee: $0");
    expect(body).toContain("Total Pilot Cost: $1,200");
  });
});

describe("deriveCrmOnboardingStage", () => {
  const base = { agreement: null, intakeConfig: null, submission: null, invoice: null, clientStatus: "Prospect" };

  it("Client Agreed - no agreement yet", () => {
    expect(deriveCrmOnboardingStage(base)).toBe("Client Agreed");
  });

  it("Agreement Draft", () => {
    expect(deriveCrmOnboardingStage({ ...base, agreement: { status: "draft" } })).toBe("Agreement Draft");
  });

  it("Agreement Sent", () => {
    expect(deriveCrmOnboardingStage({ ...base, agreement: { status: "sent" } })).toBe("Agreement Sent");
  });

  it("Agreement Signed - signed, no intake config yet", () => {
    expect(deriveCrmOnboardingStage({ ...base, agreement: { status: "signed" } })).toBe("Agreement Signed");
  });

  it("Agreement Signed - intake config still draft (not sent)", () => {
    expect(deriveCrmOnboardingStage({ ...base, agreement: { status: "signed" }, intakeConfig: { status: "draft" } })).toBe("Agreement Signed");
  });

  it("Intake Form Customized and Sent", () => {
    expect(
      deriveCrmOnboardingStage({ ...base, agreement: { status: "signed" }, intakeConfig: { status: "sent" } })
    ).toBe("Intake Form Customized and Sent");
  });

  it("Intake Received - a submission exists", () => {
    expect(
      deriveCrmOnboardingStage({
        ...base,
        agreement: { status: "signed" },
        intakeConfig: { status: "sent" },
        submission: { id: "sub-1" },
      })
    ).toBe("Intake Received");
  });

  it("Invoice Sent - invoice status 'sent'", () => {
    expect(
      deriveCrmOnboardingStage({
        ...base,
        agreement: { status: "signed" },
        intakeConfig: { status: "sent" },
        submission: { id: "sub-1" },
        invoice: { status: "sent" },
      })
    ).toBe("Invoice Sent");
  });

  it("Invoice Sent - invoice status 'payment_pending' also reads as Invoice Sent", () => {
    expect(
      deriveCrmOnboardingStage({
        ...base,
        agreement: { status: "signed" },
        intakeConfig: { status: "sent" },
        submission: { id: "sub-1" },
        invoice: { status: "payment_pending" },
      })
    ).toBe("Invoice Sent");
  });

  it("Payment Received", () => {
    expect(
      deriveCrmOnboardingStage({
        ...base,
        agreement: { status: "signed" },
        intakeConfig: { status: "sent" },
        submission: { id: "sub-1" },
        invoice: { status: "payment_received" },
      })
    ).toBe("Payment Received");
  });

  it("Campaign Active - client status is Active, regardless of anything else", () => {
    expect(deriveCrmOnboardingStage({ ...base, clientStatus: "Active" })).toBe("Campaign Active");
    expect(
      deriveCrmOnboardingStage({
        ...base,
        agreement: { status: "signed" },
        intakeConfig: { status: "sent" },
        submission: { id: "sub-1" },
        invoice: { status: "payment_received" },
        clientStatus: "Active",
      })
    ).toBe("Campaign Active");
  });
});

describe("deriveCrmPilotStage", () => {
  const base: Parameters<typeof deriveCrmPilotStage>[0] = {
    agreement: { status: "draft", pilot_status: "not_started" },
    intakeConfig: null,
    submission: null,
  };

  it("Pilot Agreed - draft", () => {
    expect(deriveCrmPilotStage(base)).toBe("Pilot Agreed");
  });

  it("Pilot Agreed - sent but not yet signed (no separate 'sent' stage for pilots)", () => {
    expect(deriveCrmPilotStage({ ...base, agreement: { status: "sent", pilot_status: "not_started" } })).toBe("Pilot Agreed");
  });

  it("Pilot Agreement Signed", () => {
    expect(deriveCrmPilotStage({ ...base, agreement: { status: "signed", pilot_status: "not_started" } })).toBe("Pilot Agreement Signed");
  });

  it("Intake Form Sent", () => {
    expect(
      deriveCrmPilotStage({ ...base, agreement: { status: "signed", pilot_status: "not_started" }, intakeConfig: { status: "sent" } })
    ).toBe("Intake Form Sent");
  });

  it("Intake Received", () => {
    expect(
      deriveCrmPilotStage({
        ...base,
        agreement: { status: "signed", pilot_status: "not_started" },
        intakeConfig: { status: "sent" },
        submission: { id: "sub-1" },
      })
    ).toBe("Intake Received");
  });

  it("Pilot Active", () => {
    expect(
      deriveCrmPilotStage({
        ...base,
        agreement: { status: "signed", pilot_status: "active" },
        intakeConfig: { status: "sent" },
        submission: { id: "sub-1" },
      })
    ).toBe("Pilot Active");
  });

  it("Results Review", () => {
    expect(deriveCrmPilotStage({ ...base, agreement: { status: "signed", pilot_status: "results_review" } })).toBe("Results Review");
  });

  it("Converted to Paid Campaign", () => {
    expect(deriveCrmPilotStage({ ...base, agreement: { status: "superseded", pilot_status: "converted" } })).toBe("Converted to Paid Campaign");
  });

  it("Pilot Extended", () => {
    expect(deriveCrmPilotStage({ ...base, agreement: { status: "superseded", pilot_status: "extended" } })).toBe("Pilot Extended");
  });

  it("Pilot Closed", () => {
    expect(deriveCrmPilotStage({ ...base, agreement: { status: "archived", pilot_status: "closed" } })).toBe("Pilot Closed");
  });

  it("pilot_status terminal states take priority even if intake/submission data would suggest an earlier stage", () => {
    expect(
      deriveCrmPilotStage({
        agreement: { status: "archived", pilot_status: "closed" },
        intakeConfig: null,
        submission: null,
      })
    ).toBe("Pilot Closed");
  });
});

describe("isAgreementLocked", () => {
  it("is unlocked when the agreement has never been signed", () => {
    expect(isAgreementLocked({ accepted_at: null })).toBe(false);
  });

  it("is locked once accepted_at is set", () => {
    expect(isAgreementLocked({ accepted_at: "2026-06-21T09:00:00Z" })).toBe(true);
  });
});

describe("signedAgreementNotificationTitle", () => {
  it("produces the exact required message", () => {
    expect(signedAgreementNotificationTitle("Real Test Business", "AGR-2026-0001")).toBe("Real Test Business signed agreement AGR-2026-0001.");
  });
});

describe("intakeSubmittedNotificationTitle", () => {
  it("produces the exact required message", () => {
    expect(intakeSubmittedNotificationTitle("Real Test Business")).toBe("Real Test Business submitted their client intake form.");
  });
});

describe("findIntakeAgreementConflicts", () => {
  it("flags a preferred start date that disagrees with the signed agreement's campaign start date", () => {
    const conflicts = findIntakeAgreementConflicts({ campaign_start_date: "2026-09-01" }, { preferred_start_date: "2026-10-15" });
    expect(conflicts).toEqual([{ fieldKey: "preferred_start_date", agreementValue: "2026-09-01", intakeValue: "2026-10-15" }]);
  });

  it("does not flag a matching preferred start date", () => {
    expect(findIntakeAgreementConflicts({ campaign_start_date: "2026-09-01" }, { preferred_start_date: "2026-09-01" })).toEqual([]);
  });

  it("does not flag anything when no preferred start date was submitted", () => {
    expect(findIntakeAgreementConflicts({ campaign_start_date: "2026-09-01" }, {})).toEqual([]);
  });
});
