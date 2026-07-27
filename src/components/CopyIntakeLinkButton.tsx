"use client";

import { useState } from "react";
import { PROVIDER_INTAKE_URL } from "@/lib/provider-intake-content";

// "Copy Intake Link" (brief section 6) - copies the fixed provider intake
// form URL and shows a small confirmation message. Shared across the
// provider list and both detail pages.
export default function CopyIntakeLinkButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(PROVIDER_INTAKE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context); the
      // link is also shown in the Send Intake Form modal as a fallback.
    }
  }

  return (
    <button type="button" onClick={handleCopy} className={className}>
      {copied ? "Provider intake link copied." : "Copy Intake Link"}
    </button>
  );
}
