import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import EmailTrackingTable, { type EmailTrackingRecord } from "@/components/crm-ui/EmailTrackingTable";
import {
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  leadgenEmailStatusAt,
  type LeadgenEmailRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";

// Email Tracking - every email the Lead Generation CRM has sent (agent or
// system), with its live Resend delivery status. Read-only, same
// EmailTrackingTable component as the Growth CRM's own Email Tracking page
// (/admin/crm/emails) so both CRMs share the same design and behavior -
// status is kept current entirely by the existing Resend webhook handler
// (src/app/api/webhooks/resend/route.ts), which is unchanged.
export default async function LeadgenAdminEmailsPage() {
  await requireLeadgenAdmin();
  const admin = getSupabaseAdmin();

  const [{ data: emails }, { data: leads }, { data: users }] = await Promise.all([
    admin.from("leadgen_emails").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("leadgen_leads").select("id, business_name"),
    admin.from("leadgen_users").select("id, full_name, email"),
  ]);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l] as const));
  const userById = new Map((users ?? []).map((u) => [u.id, u] as const));

  const records: EmailTrackingRecord[] = ((emails ?? []) as LeadgenEmailRow[]).map((email) => {
    const lead = email.lead_id ? (leadById.get(email.lead_id) as Pick<LeadgenLeadRow, "id" | "business_name"> | undefined) : undefined;
    const sender = email.sent_by ? (userById.get(email.sent_by) as Pick<LeadgenUserRow, "id" | "full_name" | "email"> | undefined) : undefined;
    const senderLabel = sender ? sender.full_name || sender.email : email.sent_by ? "Removed User" : "System";

    return {
      id: email.id,
      sentAt: email.sent_at ?? email.created_at,
      entityLabel: lead?.business_name ?? null,
      entityHref: lead ? `/leadgen/admin/leads/${lead.id}` : null,
      entityEmptyLabel: "No lead",
      recipientEmail: email.to_email,
      recipientName: email.to_name,
      subject: email.subject,
      status: {
        value: email.status,
        label: LEADGEN_EMAIL_STATUS_LABELS[email.status],
        className: LEADGEN_EMAIL_STATUS_STYLES[email.status],
      },
      details: [
        { label: "Full Subject", value: email.subject },
        { label: "Sender / Agent", value: `${senderLabel} <${email.sender_email}>` },
        { label: "Resend ID", value: email.resend_message_id ?? "—" },
        { label: "Delivered", value: email.delivered_at ? new Date(email.delivered_at).toLocaleString() : "—" },
        { label: "Opened", value: email.opened_at ? new Date(email.opened_at).toLocaleString() : "—" },
        { label: "Clicked", value: email.clicked_at ? new Date(email.clicked_at).toLocaleString() : "—" },
        {
          label: "Failure / Bounce Reason",
          value: email.bounce_reason || email.failure_reason || "—",
        },
        { label: "Last Status Update", value: new Date(leadgenEmailStatusAt(email)).toLocaleString() },
      ],
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Email Tracking</h1>
        <Link href="/leadgen/admin/emails/test" className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
          Send Test Email
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">All Lead Generation CRM email delivery records across every agent and lead.</p>

      <section className="mt-6 min-w-0 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        <EmailTrackingTable records={records} />
      </section>
    </div>
  );
}
