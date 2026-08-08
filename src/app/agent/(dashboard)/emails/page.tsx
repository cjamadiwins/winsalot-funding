import Link from "next/link";
import { requireCrmUser } from "@/lib/crm-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  EMAIL_TYPE_LABELS,
  type CrmLeadEmailRow,
} from "@/lib/crm-types";

// Email Tracking - an agent's own view of the same crm_lead_emails data
// the admin Email Tracking page (/admin/crm/emails) shows, scoped to only
// the leads currently assigned to this agent. Read-only: this page never
// writes to crm_lead_emails, it's kept current entirely by the existing
// Resend webhook handler (src/app/api/webhooks/resend/route.ts), which is
// unchanged.
//
// Same two-step access pattern already used by this agent's own lead page
// (src/app/agent/(dashboard)/leads/[id]/page.tsx) for the exact same
// table: first read crm_leads through the session-scoped client, so RLS
// (crm_leads_agent_select_own) proves every id that comes back is really
// assigned to this agent - only then read crm_lead_emails, filtered to
// exactly those ids, with the service-role client (crm_lead_emails has no
// RLS policies of its own - see migration 0022 - the same reason the
// per-lead EmailStatusPanel already needs the service-role client).
export default async function AgentEmailsPage() {
  const agent = await requireCrmUser();
  const supabase = await createSupabaseServerClient();

  const { data: leads, error: leadsError } = await supabase
    .from("crm_leads")
    .select("id, business_name, contact_name")
    .eq("assigned_agent_id", agent.id);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l] as const));
  const leadIds = (leads ?? []).map((l) => l.id);

  const admin = getSupabaseAdmin();
  const { data: emails, error: emailsError } = leadIds.length
    ? await admin
        .from("crm_lead_emails")
        .select("*")
        .in("lead_id", leadIds)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(200)
    : { data: [] as CrmLeadEmailRow[], error: null };

  return (
    <div>
      <h1 className="font-heading text-[22px] font-bold text-[var(--color-ink-strong)]">Email Tracking</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Every quote-request and follow-up email sent to your assigned customers, with its live
        Sent / Delivered / Bounced / Failed status from Resend.
      </p>

      {(leadsError || emailsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load email tracking data: {(leadsError ?? emailsError)?.message}
        </p>
      )}

      {!leadsError && !emailsError && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
          {!emails || emails.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No tracked emails yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                    <th className="py-2 pr-3">Sent At</th>
                    <th className="py-2 pr-3">Recipient</th>
                    <th className="py-2 pr-3">Email Address</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(emails as CrmLeadEmailRow[]).map((email) => {
                    const lead = email.lead_id ? leadById.get(email.lead_id) : undefined;

                    return (
                      <tr key={email.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3 text-slate-600">
                          {new Date(email.sent_at ?? email.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">
                          {lead ? (
                            <Link href={`/agent/leads/${lead.id}`} className="font-medium text-sky-600 hover:text-sky-700">
                              {lead.contact_name || lead.business_name}
                            </Link>
                          ) : (
                            <span className="text-slate-500">Unknown lead</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{email.to_email}</td>
                        <td className="py-2 pr-3 text-slate-700">{EMAIL_TYPE_LABELS[email.email_type]}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${EMAIL_STATUS_STYLES[email.status]}`}
                          >
                            {EMAIL_STATUS_LABELS[email.status]}
                          </span>
                        </td>
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
