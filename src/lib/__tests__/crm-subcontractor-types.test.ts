import { describe, expect, it } from "vitest";
import {
  canActivateSubcontractor,
  deriveSubcontractorOnboardingChecklist,
  onboardingProgressSummary,
  requiredTrainingComplete,
  sumSubcontractorPaymentRecordsByCurrency,
  type SubcontractorTrainingModuleRow,
  type SubcontractorTrainingProgressRow,
} from "@/lib/crm-subcontractor-types";

// Covers the Growth CRM subcontractor lifecycle's pure logic
// (supabase/migrations/0136/0137): the derived (never stored) onboarding
// checklist, activation gating, required-training completion, and
// per-currency payment aggregation. Exercised against the brief's three
// mock subcontractors: Nigeria/NGN/Per Appointment, Philippines/PHP/Hourly,
// Canada/CAD/Fixed Project.

function baseSubcontractor(overrides: Partial<Parameters<typeof deriveSubcontractorOnboardingChecklist>[0]["subcontractor"]> = {}) {
  return {
    email: "worker@example.com",
    phone: "+1 555 0100",
    country: "Nigeria",
    currency: "NGN" as const,
    pay_type: "per_lead_appointment" as const,
    status: "pending_onboarding" as const,
    ...overrides,
  };
}

describe("deriveSubcontractorOnboardingChecklist", () => {
  it("marks every item except payment_setup incomplete for a freshly created subcontractor with no linked records", () => {
    // currency/pay_type are NOT NULL columns with defaults, so payment_setup
    // is trivially satisfied the moment a row exists - only personal_info
    // (email/phone/country) and the four linked-record items can be blank.
    const items = deriveSubcontractorOnboardingChecklist({
      subcontractor: { email: null, phone: null, country: null, currency: "NGN", pay_type: "per_lead_appointment", status: "pending_onboarding" },
      hasCurrentAgreement: false,
      hasCurrentAssignment: false,
      requiredModulesComplete: false,
      crmAccessGranted: false,
    });

    expect(items.filter((item) => item.key !== "payment_setup").every((item) => !item.complete)).toBe(true);
    expect(items.find((item) => item.key === "payment_setup")?.complete).toBe(true);
    expect(onboardingProgressSummary(items)).toBe("1 of 7 completed");
  });

  it("completes personal_info only once email, phone, and country are all present (Test 1: Nigeria/NGN/Per Appointment)", () => {
    const items = deriveSubcontractorOnboardingChecklist({
      subcontractor: baseSubcontractor(),
      hasCurrentAgreement: false,
      hasCurrentAssignment: false,
      requiredModulesComplete: false,
      crmAccessGranted: false,
    });
    const personalInfo = items.find((item) => item.key === "personal_info");
    expect(personalInfo?.complete).toBe(true);

    const missingPhone = deriveSubcontractorOnboardingChecklist({
      subcontractor: baseSubcontractor({ phone: null }),
      hasCurrentAgreement: false,
      hasCurrentAssignment: false,
      requiredModulesComplete: false,
      crmAccessGranted: false,
    });
    expect(missingPhone.find((item) => item.key === "personal_info")?.complete).toBe(false);
  });

  it("marks every item complete and reports 7 of 7 once every dependency is satisfied (Test 2: Philippines/PHP/Hourly)", () => {
    const items = deriveSubcontractorOnboardingChecklist({
      subcontractor: baseSubcontractor({ country: "Philippines", currency: "PHP", pay_type: "hourly", status: "active" }),
      hasCurrentAgreement: true,
      hasCurrentAssignment: true,
      requiredModulesComplete: true,
      crmAccessGranted: true,
    });

    expect(items.every((item) => item.complete)).toBe(true);
    expect(onboardingProgressSummary(items)).toBe("7 of 7 completed");
  });

  it("keeps 'active' gated on status alone, independent of the other six items (Test 3: Canada/CAD/Fixed Project)", () => {
    const items = deriveSubcontractorOnboardingChecklist({
      subcontractor: baseSubcontractor({ country: "Canada", currency: "CAD", pay_type: "fixed", status: "pending_onboarding" }),
      hasCurrentAgreement: true,
      hasCurrentAssignment: true,
      requiredModulesComplete: true,
      crmAccessGranted: true,
    });

    expect(items.find((item) => item.key === "active")?.complete).toBe(false);
    expect(items.filter((item) => item.key !== "active").every((item) => item.complete)).toBe(true);
  });
});

describe("canActivateSubcontractor", () => {
  it("is true once every non-'active' item is complete", () => {
    const items = deriveSubcontractorOnboardingChecklist({
      subcontractor: baseSubcontractor({ status: "pending_onboarding" }),
      hasCurrentAgreement: true,
      hasCurrentAssignment: true,
      requiredModulesComplete: true,
      crmAccessGranted: true,
    });
    expect(canActivateSubcontractor(items)).toBe(true);
  });

  it("is false while any onboarding item is still incomplete", () => {
    const items = deriveSubcontractorOnboardingChecklist({
      subcontractor: baseSubcontractor({ status: "pending_onboarding" }),
      hasCurrentAgreement: false,
      hasCurrentAssignment: true,
      requiredModulesComplete: true,
      crmAccessGranted: true,
    });
    expect(canActivateSubcontractor(items)).toBe(false);
  });
});

describe("requiredTrainingComplete", () => {
  const modules: SubcontractorTrainingModuleRow[] = [
    { id: "m1", created_at: "", updated_at: "", slug: "welcome", title: "Welcome", sort_order: 1, is_required: true, is_active: true, content: "" },
    { id: "m2", created_at: "", updated_at: "", slug: "confidentiality", title: "Confidentiality", sort_order: 2, is_required: true, is_active: true, content: "" },
    { id: "m3", created_at: "", updated_at: "", slug: "optional", title: "Optional", sort_order: 3, is_required: false, is_active: true, content: "" },
    { id: "m4", created_at: "", updated_at: "", slug: "retired", title: "Retired", sort_order: 4, is_required: true, is_active: false, content: "" },
  ];

  function progress(entries: Partial<Record<string, SubcontractorTrainingProgressRow["status"]>>) {
    const map = new Map<string, Pick<SubcontractorTrainingProgressRow, "status" | "required_override">>();
    for (const [id, status] of Object.entries(entries)) {
      map.set(id, { status: status as SubcontractorTrainingProgressRow["status"], required_override: null });
    }
    return map;
  }

  it("ignores inactive modules and modules that are not required", () => {
    expect(requiredTrainingComplete(modules, progress({ m1: "completed", m2: "completed" }))).toBe(true);
  });

  it("is false while a required, active module is not completed", () => {
    expect(requiredTrainingComplete(modules, progress({ m1: "completed" }))).toBe(false);
  });

  it("honors a per-subcontractor required_override that makes an otherwise-optional module required", () => {
    const withOverride = progress({ m1: "completed", m2: "completed" });
    withOverride.set("m3", { status: "not_started", required_override: true });
    expect(requiredTrainingComplete(modules, withOverride)).toBe(false);

    withOverride.set("m3", { status: "completed", required_override: true });
    expect(requiredTrainingComplete(modules, withOverride)).toBe(true);
  });

  it("honors a required_override that makes an otherwise-required module not required", () => {
    const withOverride = progress({ m2: "completed" });
    withOverride.set("m1", { status: "not_started", required_override: false });
    expect(requiredTrainingComplete(modules, withOverride)).toBe(true);
  });
});

describe("sumSubcontractorPaymentRecordsByCurrency", () => {
  it("sums net_pay per payment's own currency_snapshot, never across currencies", () => {
    const totals = sumSubcontractorPaymentRecordsByCurrency([
      { currency_snapshot: "NGN", net_pay: 50000 },
      { currency_snapshot: "NGN", net_pay: 25000 },
      { currency_snapshot: "PHP", net_pay: 12000 },
      { currency_snapshot: "CAD", net_pay: 1500.5 },
    ]);

    expect(totals).toEqual({ NGN: 75000, PHP: 12000, CAD: 1500.5 });
  });

  it("keeps a historical total unaffected by a currency that only appears later - each row carries its own snapshot", () => {
    const totals = sumSubcontractorPaymentRecordsByCurrency([{ currency_snapshot: "USD", net_pay: 100 }]);
    expect(totals).toEqual({ USD: 100 });
    expect(totals.NGN).toBeUndefined();
  });
});
