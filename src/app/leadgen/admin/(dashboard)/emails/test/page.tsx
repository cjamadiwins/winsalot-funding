import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { LEADGEN_TEST_EMAIL_TYPES } from "@/lib/send-test-email";
import TestEmailForm from "./TestEmailForm";

// Admin-only "Send Test Email" tool (brief item 8) - sends Brent's
// Essentials' and Mantra Collab's real initial-outreach templates (read
// live from leadgen_email_templates, exactly like a real send) plus a
// sample appointment confirmation/reminder to an address of the admin's
// choosing, so each can be reviewed in a real inbox before any lead ever
// sees it. Never touches a real lead or appointment - see
// src/lib/send-test-email.ts for the sample data used.
export default async function LeadgenTestEmailPage() {
  await requireLeadgenAdmin();

  return (
    <div>
      <Link href="/leadgen/admin/emails" className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
        ← Back to Email Tracking
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Send Test Email</h1>
      <p className="mt-1 text-sm text-slate-500">
        Send a sample of Brent&apos;s Essentials&apos; or Mantra Collab&apos;s outreach email, or a sample appointment email, to your
        own inbox before it goes to a real lead. Every test subject is prefixed with &ldquo;[TEST]&rdquo; and uses obviously fake
        sample data - nothing here touches a real lead or appointment record.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <TestEmailForm types={LEADGEN_TEST_EMAIL_TYPES} />
      </section>
    </div>
  );
}
