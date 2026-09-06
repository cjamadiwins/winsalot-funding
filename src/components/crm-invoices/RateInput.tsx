"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeRateInputText, normalizeRateValue, formatRateForInput } from "@/lib/rate-input";

// The shared invoice Rate field - used by LineItemsEditor for every line
// item on both Create Invoice and Edit Invoice, so a fix here covers both.
//
// A plain `<input type="number">` bound to a numeric value is what let
// "750" render as "0750" while typing (see rate-input.ts for the full
// explanation): browsers won't rewrite a focused number input's displayed
// text when the new value is numerically the same as what's already
// there. Using `type="text"` instead means the displayed string itself is
// the thing we sanitize on every keystroke, so a leading zero has nowhere
// to survive.
export default function RateInput({ value, onChange, className }: { value: number; onChange: (value: number) => void; className?: string }) {
  const [text, setText] = useState(() => formatRateForInput(value));
  const lastCommitted = useRef(value);

  // Re-sync the displayed text only when the numeric value changed for a
  // reason other than this input's own typing (loading a different
  // invoice, switching rows, a reset) - never on every render, since that
  // would fight an in-progress "750." or "0.5" the user hasn't finished.
  useEffect(() => {
    if (value !== lastCommitted.current) {
      setText(formatRateForInput(value));
      lastCommitted.current = value;
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const sanitized = sanitizeRateInputText(e.target.value);
    setText(sanitized);
    const numeric = normalizeRateValue(sanitized);
    lastCommitted.current = numeric;
    onChange(numeric);
  }

  function handleBlur() {
    // Collapse an in-progress state (a trailing "." or an emptied field)
    // back to a clean canonical number once the admin moves on.
    setText(formatRateForInput(value));
  }

  return <input type="text" inputMode="decimal" value={text} onChange={handleChange} onBlur={handleBlur} className={className} />;
}
