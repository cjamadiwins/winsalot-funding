import Link from "next/link";
import { requireCrmAdmin } from "@/lib/crm-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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
// page (/leadgen/admin/emails).
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Email Tracking</h1>
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
        <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          {!emails || emails.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No tracked emails yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                    <th className="py-2 pr-3">Sent At</th>
                    <th className="py-2 pr-3">Recipient</th>
                    <th className="py-2 pr-3">Email Address</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Sent By</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Status Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {(emails as CrmLeadEmailRow[]).map((email) => {
                    const opportunity = email.opportunity_id
                      ? (opportunityById.get(email.opportunity_id) as
                          | Pick<CrmOpportunityRow, "id" | "business_name" | "contact_name">
                          | undefined)
                      : undefined;
                    const agent = email.agent_id
                      ? (agentById.get(email.agent_id) as Pick<CrmUserRow, "id" | "full_name" | "email"> | undefined)
                      : undefined;

                    return (
                      <tr key={email.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3 text-slate-600">
                          {new Date(email.sent_at ?? email.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">
                          {opportunity ? (
                            <Link
                              href={`/admin/crm/opportunities/${opportunity.id}`}
                              className="font-medium text-sky-600 hover:text-sky-700"
                            >
                              {opportunity.contact_name || opportunity.business_name}
                            </Link>
                          ) : (
                            <span className="text-slate-500">No opportunity</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{email.to_email}</td>
                        <td className="py-2 pr-3 text-slate-700">{EMAIL_TYPE_LABELS[email.email_type]}</td>
                        <td className="py-2 pr-3 text-slate-700">
                          {agent ? agent.full_name || agent.email : email.agent_id ? "Removed User" : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${EMAIL_STATUS_STYLES[email.status]}`}
                          >
                            {EMAIL_STATUS_LABELS[email.status]}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-500">{new Date(email.status_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
