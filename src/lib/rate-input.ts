// Shared normalization for the invoice Rate field (crm_invoice_line_items.unit_price).
//
// Root cause of the "750 becomes 0750" bug: the Rate field used
// `<input type="number">` with a plain numeric controlled value. Browsers
// don't rewrite a number input's raw text while it's focused whenever the
// new value parses to the same number as what's already on screen (e.g.
// "07" and "7" both parse to 7), so once a stray leading zero appears
// mid-typing, a numeric-value-only React input can never clear it. Using a
// text input whose displayed string is itself kept leading-zero-free (via
// sanitizeRateInputText below) sidesteps that browser behavior entirely,
// and normalizeRateValue re-asserts a clean number at every boundary
// (submit, load) so the problem can't creep back in through another path.

// Applied on every keystroke in the Rate input so the on-screen text
// itself never carries a leading zero, a stray extra decimal point, or
// any non-numeric character - only digits and at most one "." survive.
export function sanitizeRateInputText(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, "");

  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  if (cleaned === "") return "";

  const [intPart, decPart] = cleaned.split(".");
  let normalizedInt = intPart.replace(/^0+(?=\d)/, "");
  if (normalizedInt === "") normalizedInt = "0";

  return decPart === undefined ? normalizedInt : `${normalizedInt}.${decPart}`;
}

// Applied before an invoice's line items are saved (and again as a
// defensive check whenever a rate is loaded back for display) - collapses
// whatever text or number came in to a clean, non-negative number rounded
// to cents, matching the unit_price numeric(12,2) column.
export function normalizeRateValue(value: number | string | null | undefined): number {
  const numeric = typeof value === "string" ? Number(sanitizeRateInputText(value) || "0") : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100) / 100;
}

// Renders a numeric rate as input text - a plain string conversion is
// always leading-zero-free since JS numbers never stringify with one.
export function formatRateForInput(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}
