import Link from "next/link";
import { requireLeadgenAgent } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { QC_STATUS_LABELS, QC_STATUS_STYLES, type QcStatus } from "@/lib/leadgen-qualification";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  lead_id: string | null;
  business_name: string;
  client_id: string;
  appointment_date: string;
  appointment_time: string;
  qc_status: QcStatus;
  qc_admin_feedback: string | null;
  qc_rejection_reason: string | null;
  qc_submitted_at: string | null;
};

// The agent's view of Appointment Quality Control: every appointment they
// submitted for a client that requires qualification, with the Admin's
// decision and feedback. RLS limits the rows to this agent's own appointments.
export default async function LeadgenAgentAppointmentApprovalsPage() {
  await requireLeadgenAgent();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_appointments")
    .select("id, lead_id, business_name, client_id, appointment_date, appointment_time, qc_status, qc_admin_feedback, qc_rejection_reason, qc_submitted_at")
    .neq("qc_status", "not_required")
    .order("qc_submitted_at", { ascending: false, nullsFirst: false });
  const rows = (error ? [] : data ?? []) as Row[];
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
  const { data: clients } = clientIds.length ? await supabase.from("leadgen_clients").select("id, name").in("id", clientIds) : { data: [] };
  const clientName = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]));

  const attention = rows.filter((r) => r.qc_status === "needs_info").length;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900">Appointment Approvals</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Appointments for clients that require Admin approval. The client and the prospect are only told once Admin approves. {attention > 0 ? `${attention} need more qualification from you.` : ""}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-5 text-sm text-slate-500">No appointments are going through approval yet.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-slate-900">{r.business_name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${QC_STATUS_STYLES[r.qc_status]}`}>{QC_STATUS_LABELS[r.qc_status]}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700">{clientName.get(r.client_id) ?? "Client"}</span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-slate-500">
                {r.appointment_date} {r.appointment_time.slice(0, 5)}
                {r.qc_submitted_at ? ` · Submitted ${new Date(r.qc_submitted_at).toLocaleString()}` : ""}
              </p>
              {r.qc_rejection_reason && <p className="mt-1 text-sm text-red-800">Rejected: {r.qc_rejection_reason}</p>}
              {r.qc_admin_feedback && <p className="mt-1 text-sm text-slate-700">Admin feedback: {r.qc_admin_feedback}</p>}
              {r.qc_status === "needs_info" && r.lead_id && (
                <Link href={`/leadgen/agent/leads/${r.lead_id}`} className="mt-2 inline-block rounded-full bg-sky-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-sky-700">
                  Update qualification and resubmit
                </Link>
              )}
              {r.qc_status === "rejected" && r.lead_id && (
                <Link href={`/leadgen/agent/leads/${r.lead_id}`} className="mt-2 inline-block text-[13px] font-semibold text-sky-700 hover:underline">
                  Open lead (continue follow-up)
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
