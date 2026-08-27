import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { CRM_TEST_EMAIL_TYPES } from "@/lib/send-test-email";
import TestEmailForm from "./TestEmailForm";

// Admin-only "Send Test Email" tool (brief item 8) - sends any of the
// Growth CRM's real email templates (invoices, Winsalot consultation
// appointment confirmations/reminders) with sample data to an address of
// the admin's choosing, so it can be reviewed in a real inbox before any
// client or prospect ever sees it. Never touches a real invoice or
// appointment - see src/lib/send-test-email.ts for the sample data used.
export default async function CrmTestEmailPage() {
  await requireCrmAdmin();

  return (
    <div>
      <Link href="/admin/crm/emails" className="text-[13px] font-semibold text-sky-600 hover:text-sky-700">
        ← Back to Email Tracking
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Send Test Email</h1>
      <p className="mt-1 text-sm text-slate-500">
        Send a sample of any invoice, appointment, or prospect-consultation email to your own inbox before it goes to a real client or
        prospect. Every test subject is prefixed with &ldquo;[TEST]&rdquo; and uses obviously fake sample data - nothing here touches a
        real invoice, appointment, or prospect record.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <TestEmailForm types={CRM_TEST_EMAIL_TYPES} />
      </section>
    </div>
  );
}
