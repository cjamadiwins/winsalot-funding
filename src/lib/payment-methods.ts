// Winsalot Growth CRM: the payment method(s) Winsalot Corp currently
// accepts from Growth CRM clients - shown during client onboarding (near
// pricing/agreement/invoice) and to Admin on the onboarding/client
// record. A small, static, code-configured list rather than a database
// table or per-client field: there is currently exactly one approved
// method and no client-facing choice to make, so there is nothing
// per-client to store, migrate, or leave blank on an older client
// record - every client, past or present, reads the same current list.
//
// Adding a second method later (Credit/Debit Card, Bank Transfer, Online
// Payment Link) means adding another entry below with enabled: true -
// every display that reads from getEnabledPaymentMethods()/
// getPrimaryPaymentMethod() picks it up automatically. A method with
// enabled: false is never shown anywhere (client-facing or admin-facing).
//
// Deliberately holds only a payment email address and plain client-facing
// instructions - never a bank account number, routing/transit number, or
// any other sensitive banking credential.

export type PaymentMethodId = "interac_e_transfer" | "credit_debit_card" | "bank_transfer" | "online_payment_link";

export type PaymentMethodConfig = {
  id: PaymentMethodId;
  label: string;
  paymentEmail: string | null;
  clientInstructions: string;
  enabled: boolean;
};

export const PAYMENT_METHOD_CONFIGS: readonly PaymentMethodConfig[] = [
  {
    id: "interac_e_transfer",
    label: "Interac e-Transfer",
    paymentEmail: "info@winsalotcorp.com",
    clientInstructions:
      "Send your Interac e-Transfer payment to: info@winsalotcorp.com\n\n" +
      "Please include your business name or invoice number in the transfer message so Winsalot Corp can correctly match the payment to your account.",
    enabled: true,
  },
  // Not yet configured - kept here as a placeholder for the future option
  // the brief names, never shown while enabled is false.
  { id: "credit_debit_card", label: "Credit/Debit Card", paymentEmail: null, clientInstructions: "", enabled: false },
  { id: "bank_transfer", label: "Bank Transfer", paymentEmail: null, clientInstructions: "", enabled: false },
  { id: "online_payment_link", label: "Online Payment Link", paymentEmail: null, clientInstructions: "", enabled: false },
] as const;

// Only ever the methods Winsalot Corp is actually set up to accept right
// now - never a configured-but-disabled placeholder.
export function getEnabledPaymentMethods(): PaymentMethodConfig[] {
  return PAYMENT_METHOD_CONFIGS.filter((m) => m.enabled);
}

// Today there is exactly one enabled method. If a second is ever enabled
// alongside it, this keeps returning the first configured entry (Interac
// e-Transfer stays primary) rather than picking arbitrarily.
export function getPrimaryPaymentMethod(): PaymentMethodConfig | null {
  return getEnabledPaymentMethods()[0] ?? null;
}

// The default text pre-filled into a new invoice's existing free-text
// payment_instructions field (crm_invoices.payment_instructions) so an
// admin doesn't have to retype it. Still a plain, editable field per
// invoice - a client with a special staged/performance-based payment
// arrangement can have it edited or cleared without touching this shared
// config, and it never overwrites payment_due_terms or any other
// pricing/schedule field.
export function defaultPaymentInstructionsText(): string | null {
  return getPrimaryPaymentMethod()?.clientInstructions || null;
}
