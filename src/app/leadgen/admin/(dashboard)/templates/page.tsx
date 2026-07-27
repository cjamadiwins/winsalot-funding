import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadgenEmailTemplateRow } from "@/lib/leadgen-types";
import TemplatesClient from "./TemplatesClient";

export default async function LeadgenTemplatesPage() {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();
  const { data: templates } = await admin.from("leadgen_email_templates").select("*").order("name");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Email Templates</h1>
      <p className="mt-1 text-sm text-slate-500">
        Reusable templates used when composing a client or prospect email. Use <code>{"{{first_name}}"}</code> and{" "}
        <code>{"{{booking_paragraph}}"}</code> as placeholders in a prospect-facing template.
      </p>

      <TemplatesClient templates={(templates ?? []) as LeadgenEmailTemplateRow[]} />
    </div>
  );
}
