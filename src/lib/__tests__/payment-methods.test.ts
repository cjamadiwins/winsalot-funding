import { describe, expect, it } from "vitest";
import { getEnabledPaymentMethods, getPrimaryPaymentMethod, defaultPaymentInstructionsText, PAYMENT_METHOD_CONFIGS } from "../payment-methods";

describe("payment-methods", () => {
  it("only Interac e-Transfer is currently enabled", () => {
    const enabled = getEnabledPaymentMethods();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe("interac_e_transfer");
  });

  it("uses the exact required payment email", () => {
    expect(getPrimaryPaymentMethod()?.paymentEmail).toBe("info@winsalotcorp.com");
  });

  it("client instructions never include bank account or routing/transit numbers", () => {
    for (const method of PAYMENT_METHOD_CONFIGS) {
      expect(method.clientInstructions.toLowerCase()).not.toContain("account number");
      expect(method.clientInstructions.toLowerCase()).not.toContain("routing");
      expect(method.clientInstructions.toLowerCase()).not.toContain("transit number");
    }
  });

  it("default invoice payment instructions match the enabled method's client instructions", () => {
    expect(defaultPaymentInstructionsText()).toBe(getPrimaryPaymentMethod()!.clientInstructions);
  });

  it("disabled methods are never returned by getEnabledPaymentMethods", () => {
    const enabledIds = getEnabledPaymentMethods().map((m) => m.id);
    expect(enabledIds).not.toContain("credit_debit_card");
    expect(enabledIds).not.toContain("bank_transfer");
    expect(enabledIds).not.toContain("online_payment_link");
  });
});
