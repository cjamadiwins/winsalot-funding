"use server";

import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isValidEmail } from "@/lib/leadgen-types";
import { sendLeadgenTestEmail, LEADGEN_TEST_EMAIL_TYPES, type LeadgenTestEmailType } from "@/lib/send-test-email";

type ActionResult = { error?: string; sent?: boolean };

const VALID_TYPES = new Set<string>(LEADGEN_TEST_EMAIL_TYPES.map((t) => t.id));

export async function sendLeadgenTestEmailAction(type: string, toEmail: string): Promise<ActionResult> {
  await requireLeadgenAdmin();

  const email = toEmail.trim();
  if (!email) return { error: "Enter a recipient email address." };
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (!VALID_TYPES.has(type)) return { error: "Select a valid email type." };

  const supabase = await createSupabaseServerClient();
  const result = await sendLeadgenTestEmail(
    async (key) => {
      const { data } = await supabase.from("leadgen_email_templates").select("subject, body").eq("key", key).maybeSingle();
      return data ?? null;
    },
    type as LeadgenTestEmailType,
    email
  );
  if (result.error) return { error: `Failed to send the test email: ${result.error}` };
  return { sent: true };
}
