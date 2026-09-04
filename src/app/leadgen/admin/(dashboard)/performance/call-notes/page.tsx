import Link from "next/link";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LEADGEN_LEAD_STATUS_STYLES, type LeadgenLeadStatus } from "@/lib/leadgen-types";

const NON_LEAD_OUTCOMES: LeadgenLeadStatus[] = [
  "No answer",
  "Voicemail",
  "Gatekeeper",
  "Owner reached",
  "Not interested",
  "Wrong number",
  "Do not call",
  "Closed",
];

type SearchParams = Promise<{ agent?: string; outcome?: string }>;

type CallActivity = {
  id: string;
  lead_id: string;
  agent_id: string | null;
  call_outcome: LeadgenLeadStatus | null;
  notes: string | null;
  occurred_at: string;
};

type LeadSummary = {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
};

type AgentSummary = {
  id: string;
  full_name: string;
  email: string;
};

function formatTorontoDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function LeadgenNonLeadCallNotesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireLeadgenAdmin();
  const params = await searchParams;
  const admin = getSupabaseAdmin();

  let query = admin
    .from("leadgen_lead_activities")
    .select("id, lead_id, agent_id, call_outcome, notes, occurred_at")
    .eq("activity_type", "call")
    .in("call_outcome", NON_LEAD_OUTCOMES)
    .order("occurred_at", { ascending: false })
    .limit(1000);

  if (params.agent && params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (params.outcome && params.outcome !== "all" && NON_LEAD_OUTCOMES.includes(params.outcome as LeadgenLeadStatus)) {
    query = query.eq("call_outcome", params.outcome);
  }

  const [{ data: activities, error }, { data: agents }] = await Promise.all([
    query,
    admin
      .from("leadgen_users")
      .select("id, full_name, email")
      .eq("role", "agent")
      .order("full_name"),
  ]);

  const calls = (activities ?? []) as CallActivity[];
  const leadIds = [...new Set(calls.map((call) => call.lead_id))];
  const { data: leads } = leadIds.length
    ? await admin
        .from("leadgen_leads")
        .select("id, business_name, contact_name, phone")
        .in("id", leadIds)
    : { data: [] as LeadSummary[] };

  const agentRows = (agents ?? []) as AgentSummary[];
  const leadById = new Map(((leads ?? []) as LeadSummary[]).map((lead) => [lead.id, lead]));
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));

  return (
    <div>
      <Link href="/leadgen/admin/performance" className="text-sm font-semibold text-sky-700 hover:text-sky-800">
        ← Back to Agent Performance
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Non-Lead Call Notes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review calls that did not produce an interested lead, information request, callback, or appointment.
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
          {calls.length} call note{calls.length === 1 ? "" : "s"}
        </div>
      </div>

      <form className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Agent
          <select name="agent" defaultValue={params.agent ?? "all"} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900">
            <option value="all">All agents</option>
            {agentRows.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.full_name || agent.email}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Outcome
          <select name="outcome" defaultValue={params.outcome ?? "all"} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case text-slate-900">
            <option value="all">All non-lead outcomes</option>
            {NON_LEAD_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>{outcome}</option>
            ))}
          </select>
        </label>

        <button type="submit" className="rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
          Apply Filters
        </button>
      </form>

      {error ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Call notes could not be loaded: {error.message}
        </p>
      ) : calls.length === 0 ? (
        <p className="mt-5 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No non-lead call notes match these filters.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Call Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {calls.map((call) => {
                const lead = leadById.get(call.lead_id);
                const agent = call.agent_id ? agentById.get(call.agent_id) : null;
                const outcome = call.call_outcome;
                return (
                  <tr key={call.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatTorontoDateTime(call.occurred_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{agent?.full_name || agent?.email || "Unknown"}</td>
                    <td className="px-4 py-3">
                      {lead ? (
                        <Link href={`/leadgen/admin/leads/${lead.id}`} className="font-semibold text-sky-700 hover:text-sky-800">
                          {lead.business_name}
                        </Link>
                      ) : (
                        <span className="text-slate-500">Deleted prospect</span>
                      )}
                      {lead?.contact_name && <p className="mt-0.5 text-xs text-slate-500">{lead.contact_name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {outcome ? (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${LEADGEN_LEAD_STATUS_STYLES[outcome]}`}>
                          {outcome}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="max-w-xl whitespace-pre-wrap px-4 py-3 text-slate-700">{call.notes?.trim() || "No notes entered"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
