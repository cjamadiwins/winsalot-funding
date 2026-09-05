import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CALL_LOG_OUTCOME_STYLES, formatCallLogDate, type CallLogOutcome } from "@/lib/call-log";

// Read-only Call Activity view for the signed-in client - every call our
// team logged against their own account (leadgen_call_logs.client_id),
// scoped by requireLeadgenPortalClient()'s session identity (no slug/id in
// the URL, same as every other page in this portal) and, independently,
// by leadgen_call_logs_client_select_own RLS (migration 0142) on the
// session-scoped client below. Deliberately selects only client-safe
// columns - `notes` (the internal/agent-facing call detail) and `agent_id`
// are never requested here, not just hidden in the JSX, so there's nothing
// internal in the response to begin with. Does not touch the existing
// call-log system (leadgen_call_logs table/RLS/agent flow are unchanged);
// this is purely an additive read.
type ClientCallLogRow = {
  id: string;
  created_at: string;
  business_name: string;
  phone: string;
  outcome: CallLogOutcome;
  client_visible_note: string | null;
};

export default async function ClientPortalCallActivityPage() {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("leadgen_call_logs")
    .select("id, created_at, business_name, phone, outcome, client_visible_note")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as ClientCallLogRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Call Activity</h1>
      <p className="mt-1 text-sm text-slate-500">Every call our team logged on your behalf.</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No calls logged yet.</p>
        ) : (
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Date/Time</th>
                <th className="p-3">Business</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Outcome</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap p-3 text-slate-600">{formatCallLogDate(row.created_at)}</td>
                  <td className="p-3 font-semibold text-slate-900">{row.business_name}</td>
                  <td className="p-3 text-slate-600">{row.phone}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${CALL_LOG_OUTCOME_STYLES[row.outcome]}`}>
                      {row.outcome}
                    </span>
                  </td>
                  <td className="max-w-md whitespace-pre-wrap p-3 text-slate-700">{row.client_visible_note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
