import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  LEADGEN_EMAIL_STATUS_LABELS,
  LEADGEN_EMAIL_STATUS_STYLES,
  leadgenEmailStatusAt,
  type LeadgenEmailRow,
  type LeadgenLeadRow,
  type LeadgenUserRow,
} from "@/lib/leadgen-types";

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Email Tracking</h1>
      <p className="mt-1 text-sm text-slate-500">All Lead Generation CRM email delivery records across every agent and lead.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
        {!emails || emails.length === 0 ? (
          <p className="text-[13.5px] text-slate-500">No tracked emails yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                  <th className="py-2 pr-3">Sent At</th>
                  <th className="py-2 pr-3">Lead</th>
                  <th className="py-2 pr-3">Sender</th>
                  <th className="py-2 pr-3">Recipient</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Resend ID</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Status Updated</th>
                </tr>
              </thead>
              <tbody>
                {(emails as LeadgenEmailRow[]).map((email) => {
                  const lead = email.lead_id ? (leadById.get(email.lead_id) as Pick<LeadgenLeadRow, "id" | "business_name"> | undefined) : undefined;
                  const sender = email.sent_by
                    ? (userById.get(email.sent_by) as Pick<LeadgenUserRow, "id" | "full_name" | "email"> | undefined)
                    : undefined;

                  return (
                    <tr key={email.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3 text-slate-600">{email.sent_at ? new Date(email.sent_at).toLocaleString() : new Date(email.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        {lead ? (
                          <Link href={`/leadgen/admin/leads/${lead.id}`} className="font-medium text-sky-600 hover:text-sky-700">
                            {lead.business_name}
                          </Link>
                        ) : (
                          <span className="text-slate-500">No lead</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{sender ? sender.full_name || sender.email : email.sent_by ? "Removed User" : "System"}</td>
                      <td className="py-2 pr-3 text-slate-700">{email.to_email}</td>
                      <td className="max-w-[260px] truncate py-2 pr-3 text-slate-700" title={email.subject}>
                        {email.subject}
                      </td>
                      <td className="py-2 pr-3 text-[12px] text-slate-500">{email.resend_message_id ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_EMAIL_STATUS_STYLES[email.status]}`}>
                          {LEADGEN_EMAIL_STATUS_LABELS[email.status]}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{new Date(leadgenEmailStatusAt(email)).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}