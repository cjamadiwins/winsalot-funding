import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import EmailTrackingTable, { type EmailTrackingRecord } from "@/components/crm-ui/EmailTrackingTable";
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  EMAIL_TYPE_LABELS,
  type CrmLeadEmailRow,
  type CrmOpportunityRow,
  type CrmUserRow,
} from "@/lib/crm-types";

// Email Tracking - every follow-up email sent to an opportunity's contact
// from the CRM (sendTrackedCrmEmail, src/lib/send-crm-email.ts), with its
// live Resend delivery status. Read-only: this page only displays
// crm_lead_emails (migration 0022), it never writes to it - status is
// kept current entirely by the existing Resend webhook handler
// (src/app/api/webhooks/resend/route.ts), which is unchanged. Scoped to
// opportunity_id rows only, not the historical lead_id rows or the
// provider-targeted rows the same table also holds (migrations 0026/0028)
// - those aren't part of this view. Same admin-only, service-role-read
// pattern already used by the Lead Generation CRM's own Email Tracking
// page (/leadgen/admin/emails), and the same EmailTrackingTable component
// so both pages look and behave the same way.
export default async function AdminCrmEmailsPage() {
  await requireCrmAdmin();
  const admin = getSupabaseAdmin();

  const [{ data: emails, error }, { data: opportunities }, { data: agents }] = await Promise.all([
    admin
      .from("crm_lead_emails")
      .select("*")
      .not("opportunity_id", "is", null)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(500),
    admin.from("crm_opportunities").select("id, business_name, contact_name"),
    admin.from("crm_users").select("id, full_name, email"),
  ]);

  const opportunityById = new Map((opportunities ?? []).map((o) => [o.id, o] as const));
  const agentById = new Map((agents ?? []).map((a) => [a.id, a] as const));

  const records: EmailTrackingRecord[] = ((emails ?? []) as CrmLeadEmailRow[]).map((email) => {
    const opportunity = email.opportunity_id
      ? (opportunityById.get(email.opportunity_id) as Pick<CrmOpportunityRow, "id" | "business_name" | "contact_name"> | undefined)
      : undefined;
    const agent = email.agent_id ? (agentById.get(email.agent_id) as Pick<CrmUserRow, "id" | "full_name" | "email"> | undefined) : undefined;
    const senderLabel = agent ? agent.full_name || agent.email : email.agent_id ? "Removed User" : "—";

    return {
      id: email.id,
      sentAt: email.sent_at ?? email.created_at,
      entityLabel: opportunity?.business_name ?? null,
      entityHref: opportunity ? `/admin/crm/opportunities/${opportunity.id}` : null,
      entityEmptyLabel: "No opportunity",
      recipientEmail: email.to_email,
      recipientName: opportunity?.contact_name ?? null,
      subject: email.subject,
      status: {
        value: email.status,
        label: EMAIL_STATUS_LABELS[email.status],
        className: EMAIL_STATUS_STYLES[email.status],
      },
      details: [
        { label: "Full Subject", value: email.subject },
        { label: "Type", value: EMAIL_TYPE_LABELS[email.email_type] },
        { label: "Sender / Agent", value: senderLabel },
        { label: "Resend ID", value: email.resend_email_id },
        { label: "Delivered", value: email.delivered_at ? new Date(email.delivered_at).toLocaleString() : "—" },
        { label: "Opened", value: email.opened_at ? new Date(email.opened_at).toLocaleString() : "—" },
        { label: "Clicked", value: email.clicked_at ? new Date(email.clicked_at).toLocaleString() : "—" },
        {
          label: "Failure / Bounce Reason",
          value: email.bounce_reason || email.failure_reason || "—",
        },
      ],
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Email Tracking</h1>
        <Link href="/admin/crm/emails/test" className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
          Send Test Email
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Every follow-up email sent to an opportunity&apos;s contact from the CRM, with its live Sent / Delivered / Bounced / Failed status
        from Resend.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load email tracking data: {error.message}
        </p>
      )}

      {!error && (
        <section className="mt-6 min-w-0 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          <EmailTrackingTable records={records} />
        </section>
      )}
    </div>
  );
}
