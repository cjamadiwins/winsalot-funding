"use server";

import { requireCrmAdmin } from "@/lib/crm-auth";
import { sendCrmTestEmail, CRM_TEST_EMAIL_TYPES, type CrmTestEmailType } from "@/lib/send-test-email";

type ActionResult = { error?: string; sent?: boolean };

const VALID_TYPES = new Set<string>(CRM_TEST_EMAIL_TYPES.map((t) => t.id));

// Deliberately not shared with the Lead Gen CRM's isValidEmail
// (lib/leadgen-types.ts) - this file never imports from that CRM's
// module, matching this codebase's existing convention of keeping the
// two CRMs uncoupled.
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendCrmTestEmailAction(type: string, toEmail: string): Promise<ActionResult> {
  await requireCrmAdmin();

  const email = toEmail.trim();
  if (!email) return { error: "Enter a recipient email address." };
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (!VALID_TYPES.has(type)) return { error: "Select a valid email type." };

  const result = await sendCrmTestEmail(type as CrmTestEmailType, email);
  if (result.error) return { error: `Failed to send the test email: ${result.error}` };
  return { sent: true };
}
