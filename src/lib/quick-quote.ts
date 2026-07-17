// Bridges the compact hero "quick quote" form to the full quote form
// further down the same page. The hero form only collects a few fields
// and never submits on its own — it dispatches a browser event with its
// values and scrolls to the full form, which owns all real validation,
// the honeypot, and the actual API submission. This keeps there being
// exactly one code path that talks to the backend.

export const QUICK_QUOTE_EVENT = "afsoon-quick-quote";

export type QuickQuotePrefill = {
  fullName: string;
  phone: string;
  email: string;
  description: string;
};

export type QuickQuoteEvent = CustomEvent<QuickQuotePrefill>;
