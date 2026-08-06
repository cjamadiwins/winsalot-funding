import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  type LeadgenEmailRow,
} from "@/lib/leadgen-types";

// Email Tracking - an agent's own view of the same leadgen_emails data
// already shown on the admin Email Tracking page (/leadgen/admin/emails)
// and on each lead's own Email History table (LeadDetailClient), just
// aggregated into one list scoped to this agent's assigned leads. This
// reuses that existing tracking system as-is - it never writes to
// leadgen_emails, which is kept current entirely by the existing Resend
// webhook handler (src/app/api/webhooks/resend/route.ts), unchanged.
export default async function LeadgenAgentEmailsPage() {
  const agent = await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();

  // RLS (leadgen_leads_agent_select_own) scopes this to leads currently
  // assigned to this agent.
  const { data: leads, error: leadsError } = await supabase
    .from("leadgen_leads")
    .select("id, business_name, contact_name")
    .eq("assigned_agent_id", agent.id);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l] as const));
  const leadIds = (leads ?? []).map((l) => l.id);

  // leadgen_emails already has its own RLS (leadgen_emails_agent_select_own,
  // migration 0031) letting an agent read rows tied to a lead assigned to
  // them - no service-role client needed, unlike the Cleaning CRM's
  // equivalent table. Filtering to exactly this agent's own lead ids (on
  // top of that policy) keeps this page strictly "leads assigned to them,"
  // not the policy's broader "or I personally sent it" branch, which could
  // otherwise include a lead reassigned away from this agent since.
  const { data: emails, error: emailsError } = leadIds.length
    ? await supabase
        .from("leadgen_emails")
        .select("*")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as LeadgenEmailRow[], error: null };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Email Tracking</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every email sent to your assigned leads, with its live Sent / Delivered / Bounced / Failed status.
      </p>

      {(leadsError || emailsError) && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load email tracking data: {(leadsError ?? emailsError)?.message}
        </p>
      )}

      {!leadsError && !emailsError && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          {!emails || emails.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No tracked emails yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                    <th className="py-2 pr-3">Date/Time Sent</th>
                    <th className="py-2 pr-3">Lead/Customer</th>
                    <th className="py-2 pr-3">Email Address</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(emails as LeadgenEmailRow[]).map((email) => {
                    const lead = email.lead_id ? leadById.get(email.lead_id) : undefined;

                    return (
                      <tr key={email.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3 text-slate-600">
                          {new Date(email.sent_at ?? email.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">
                          {lead ? (
                            <Link href={`/leadgen/agent/leads/${lead.id}`} className="font-medium text-sky-600 hover:text-sky-700">
                              {lead.contact_name || lead.business_name}
                            </Link>
                          ) : (
                            <span className="text-slate-500">Unknown lead</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{email.to_email}</td>
                        <td className="py-2 pr-3 text-slate-500">{email.template_key ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[email.status]}`}
                          >
                            {LEADGEN_EMAIL_STATUS_LABELS[email.status]}
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
