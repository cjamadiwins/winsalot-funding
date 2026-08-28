import { describe, expect, it } from "vitest";
import {
  buildAgreementTargetStatement,
  renderAgreementTemplate,
  deriveCrmOnboardingStage,
  deriveCrmPilotStage,
  findIntakeAgreementConflicts,
  agreedTargetLabel,
  PILOT_PROGRAM_DISCLOSURE,
  type CrmAgreementTemplateRow,
} from "../crm-agreement-types";

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
    const rendered = renderAgreementTemplate(template, { service_type: "consultation_appointments", target_type: "monthly_target", monthly_target: 8 });
    expect(rendered[0].title).toBe("Definition of a Qualified appointment");
    expect(rendered[0].body).toBe("A qualified appointment is...");
  });

  it("replaces the monthly_target section's body with the exact required statement, not just token substitution", () => {
    const rendered = renderAgreementTemplate(template, { service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 15 });
    expect(rendered[1].body).toBe(buildAgreementTargetStatement({ service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 15 }));
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
  it("carries the exact required disclosure paragraph through verbatim", () => {
    const pilotTemplate: Pick<CrmAgreementTemplateRow, "content"> = {
      content: [{ key: "pilot_disclosure", title: "Pilot Terms and No Guarantee", body: PILOT_PROGRAM_DISCLOSURE }],
    };
    const rendered = renderAgreementTemplate(pilotTemplate, { service_type: "qualified_leads", target_type: "monthly_target", monthly_target: 20 });
    expect(rendered[0].body).toBe(PILOT_PROGRAM_DISCLOSURE);
    expect(rendered[0].body).toContain("at no charge for the agreed period and scope");
    expect(rendered[0].body).toContain("is a target and not a guarantee");
    expect(rendered[0].body).toContain("Winsalot Corp does not guarantee that a lead or appointment will result in a sale.");
    expect(rendered[0].body).toContain("unless both parties agree in writing to extend it or begin a paid monthly campaign.");
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
