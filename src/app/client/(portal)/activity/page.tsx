import { requireLeadgenPortalClient } from "@/lib/leadgen-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LEADGEN_ACTIVITY_TYPE_LABELS, type LeadgenClientActivityRow } from "@/lib/leadgen-types";

// Full history behind the Dashboard's "Recent Activity" (brief section
// 14: "If a full activity/history page already exists, allow the client
// to open it from Recent Activity"). Reads leadgen_client_activities -
// the client-visible mirror table that structurally cannot carry the
// internal `notes` column (migration 0115) - so there's no internal
// admin/agent note, disciplinary info, or other-client data this page
// could ever expose even by mistake. RLS
// (leadgen_client_activities_client_select_own) is the real boundary.
export default async function ClientPortalActivityPage() {
  const { client } = await requireLeadgenPortalClient();
  const supabase = await createSupabaseServerClient();

  const { data: activities } = await supabase
    .from("leadgen_client_activities")
    .select("*")
    .eq("client_id", client.id)
    .order("occurred_at", { ascending: false })
    .limit(200);

  const rows = (activities ?? []) as LeadgenClientActivityRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Activity</h1>
      <p className="mt-1 text-sm text-slate-500">Every update on your leads and appointments, most recent first.</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-slate-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((activity) => (
              <li key={activity.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-slate-900">{LEADGEN_ACTIVITY_TYPE_LABELS[activity.activity_type]}</span>
                  <p className="mt-0.5 text-slate-600">{activity.summary}</p>
                </div>
                <span className="shrink-0 text-[12px] text-slate-500">{new Date(activity.occurred_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
