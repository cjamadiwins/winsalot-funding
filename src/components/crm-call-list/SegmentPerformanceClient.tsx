"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Archive, RotateCcw } from "lucide-react";
import StatusBadge from "@/components/crm-ui/StatusBadge";
import DeployPanelClient from "./DeployPanelClient";
import RemovedRowsPanel from "./RemovedRowsPanel";
import ManageColumnsPopover from "./ManageColumnsPopover";
import BackfillLocationsClient from "./BackfillLocationsClient";
import { KNOWN_COLUMNS, extraFieldColumnKey, isColumnHidden } from "@/lib/call-list-columns";
import { CALL_LIST_SEGMENT_STATUS_LABELS, CALL_LIST_SEGMENT_STATUS_STYLES, type CallListLeadRow, type CallListSegmentRow } from "@/lib/call-list-types";
import type { CallListTargetField } from "@/lib/call-list-column-mapping";
import type { BackfillSummary } from "@/lib/call-list-backfill";

export type SegmentCallLogView = {
  id: string;
  created_at: string;
  agent_name: string;
  business_name: string;
  contact_name: string | null;
  outcome: string;
  notes: string;
  callback_at: string | null;
  appointment_at: string | null;
};

export default function SegmentPerformanceClient({
  basePath,
  segment,
  serviceLabel,
  leads,
  removedLeads,
  agentNameById,
  allAgents,
  assignedAgentIds,
  callLogs,
  stats,
  deployAction,
  updateStatusAction,
  promoteAction,
  restoreLeadsAction,
  initialHiddenFields,
  updateColumnVisibilityAction,
  previewLocationsFileAction,
  backfillLocationsAction,
}: {
  basePath: string;
  segment: CallListSegmentRow;
  serviceLabel: string;
  leads: CallListLeadRow[];
  removedLeads: CallListLeadRow[];
  agentNameById: Map<string, string>;
  allAgents: { id: string; name: string }[];
  assignedAgentIds: string[];
  callLogs: SegmentCallLogView[];
  stats: {
    totalLeads: number;
    leadsRemaining: number;
    callsMade: number;
    interested: number;
    callbacksDue: number;
    appointmentsBooked: number;
    promoted: number;
  };
  deployAction: (segmentId: string, agentIds: string[]) => Promise<{ error?: string }>;
  updateStatusAction: (segmentId: string, status: "active" | "completed" | "archived") => Promise<{ error?: string }>;
  promoteAction: (leadId: string) => Promise<{ error?: string; id?: string; linkedExisting?: boolean }>;
  restoreLeadsAction: (segmentId: string, leadIds: string[]) => Promise<{ error?: string }>;
  initialHiddenFields: string[];
  updateColumnVisibilityAction: (hiddenFields: string[]) => Promise<{ error?: string }>;
  previewLocationsFileAction: (
    formData: FormData
  ) => Promise<{ error: string } | { headers: string[]; suggestedMapping: Record<CallListTargetField, string | null>; sampleRowCount: number }>;
  backfillLocationsAction: (formData: FormData) => Promise<{ error?: string; summary?: BackfillSummary }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "not_contacted" | "interested" | "do_not_call" | "promoted">("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [hiddenFields, setHiddenFields] = useState<string[]>(initialHiddenFields);

  const extraFieldNames = useMemo(() => {
    const keys = new Set<string>();
    for (const lead of leads) for (const key of Object.keys(lead.extra_fields ?? {})) keys.add(key);
    return [...keys].sort();
  }, [leads]);
  const availableColumns = useMemo(
    () => [...KNOWN_COLUMNS, ...extraFieldNames.map((name) => ({ key: extraFieldColumnKey(name), label: name }))],
    [extraFieldNames]
  );
  const showBusiness = !isColumnHidden(hiddenFields, "business_name");
  const showContact = !isColumnHidden(hiddenFields, "contact_name");
  const showPhone = !isColumnHidden(hiddenFields, "phone");
  const showOutcome = !isColumnHidden(hiddenFields, "last_outcome");
  const showCallback = !isColumnHidden(hiddenFields, "callback_at");

  const filteredLeads = useMemo(() => {
    let rows = leads;
    if (filter === "not_contacted") rows = rows.filter((l) => !l.last_outcome);
    if (filter === "interested") rows = rows.filter((l) => l.last_outcome === "Interested");
    if (filter === "do_not_call") rows = rows.filter((l) => l.last_outcome === "Do Not Call" || l.dnc_flag);
    if (filter === "promoted") rows = rows.filter((l) => l.promoted_opportunity_id || l.promoted_leadgen_lead_id);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((l) => [l.business_name, l.contact_name, l.phone].some((v) => (v ?? "").toLowerCase().includes(q)));
    }
    return rows;
  }, [leads, filter, search]);

  function runStatus(status: "active" | "completed" | "archived") {
    setNotice(null);
    startTransition(async () => {
      const result = await updateStatusAction(segment.id, status);
      if (result.error) setNotice(result.error);
      else router.refresh();
    });
  }

  function runPromote(leadId: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await promoteAction(leadId);
      if (result.error) setNotice(result.error);
      else {
        setNotice(result.linkedExisting ? "Linked to an existing record." : "Promoted to the pipeline.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={basePath} className="inline-flex items-center gap-1 text-[12.5px] text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" /> All segments
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{segment.name}</h1>
          <StatusBadge label={CALL_LIST_SEGMENT_STATUS_LABELS[segment.status]} className={CALL_LIST_SEGMENT_STATUS_STYLES[segment.status]} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {serviceLabel}
          {segment.territory ? ` · ${segment.territory}` : ""}
          {segment.industry ? ` · ${segment.industry}` : ""} · Uploaded {new Date(segment.created_at).toLocaleDateString()}
          {segment.deployed_at ? ` · Deployed ${new Date(segment.deployed_at).toLocaleString()}` : ""}
        </p>
      </div>

      {notice && <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{notice}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {[
          ["Total Leads", stats.totalLeads],
          ["Leads Remaining", stats.leadsRemaining],
          ["Calls Made", stats.callsMade],
          ["Interested", stats.interested],
          ["Callbacks Due", stats.callbacksDue],
          ["Appointments", stats.appointmentsBooked],
          ["Promoted", stats.promoted],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-2 text-[12.5px] text-slate-600">
          <span className="font-medium text-slate-800">Status:</span>
          {segment.status === "active" && (
            <button type="button" disabled={isPending} onClick={() => runStatus("completed")} className="inline-flex items-center gap-1 rounded-full border border-sky-300 px-2.5 py-1 text-sky-700 hover:border-sky-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Completed
            </button>
          )}
          {(segment.status === "completed" || segment.status === "archived") && (
            <button type="button" disabled={isPending} onClick={() => runStatus("active")} className="inline-flex items-center gap-1 rounded-full border border-emerald-300 px-2.5 py-1 text-emerald-700 hover:border-emerald-400">
              <RotateCcw className="h-3.5 w-3.5" /> Reactivate
            </button>
          )}
          {segment.status !== "archived" && (
            <button type="button" disabled={isPending} onClick={() => runStatus("archived")} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-slate-600 hover:border-slate-400">
              <Archive className="h-3.5 w-3.5" /> Archive
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ManageColumnsPopover
            availableColumns={availableColumns}
            extraFieldNames={extraFieldNames}
            initialHiddenFields={hiddenFields}
            updateAction={updateColumnVisibilityAction}
            onHiddenFieldsChange={setHiddenFields}
          />
          <a
            href={`${basePath}/${segment.id}/export`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-slate-400"
          >
            Export CSV
          </a>
        </div>
      </div>

      <BackfillLocationsClient previewAction={previewLocationsFileAction} backfillAction={backfillLocationsAction} />

      <DeployPanelClient
        key={[...assignedAgentIds].sort().join(",")}
        segmentId={segment.id}
        agents={allAgents}
        assignedAgentIds={assignedAgentIds}
        deployAction={deployAction}
      />

      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Assigned agents</h2>
        <div className="flex flex-wrap gap-2">
          {assignedAgentIds.length === 0 && <span className="text-sm text-slate-500">Unassigned.</span>}
          {assignedAgentIds.map((id) => (
            <span key={id} className="rounded-full bg-slate-100 px-3 py-1 text-[12.5px] text-slate-700">
              {agentNameById.get(id) ?? "Unknown"}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-900">Leads ({filteredLeads.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="rounded-lg border border-slate-300 px-2.5 py-1 text-[12.5px]" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-[12.5px]">
              <option value="all">All</option>
              <option value="not_contacted">Not Contacted</option>
              <option value="interested">Interested</option>
              <option value="do_not_call">Do Not Call</option>
              <option value="promoted">Promoted</option>
            </select>
          </div>
        </div>
        {filteredLeads.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No leads match these filters.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                {showBusiness && <th className="px-3 py-2 font-semibold">Business</th>}
                {showContact && <th className="px-3 py-2 font-semibold">Contact</th>}
                {showPhone && <th className="px-3 py-2 font-semibold">Phone</th>}
                {showOutcome && <th className="px-3 py-2 font-semibold">Last Outcome</th>}
                {showCallback && <th className="px-3 py-2 font-semibold">Callback</th>}
                <th className="px-3 py-2 font-semibold">Promoted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => {
                const promotedId = lead.promoted_opportunity_id || lead.promoted_leadgen_lead_id;
                return (
                  <tr key={lead.id}>
                    {showBusiness && <td className="px-3 py-2">{lead.business_name}</td>}
                    {showContact && <td className="px-3 py-2 text-slate-600">{lead.contact_name ?? "—"}</td>}
                    {showPhone && <td className="px-3 py-2 text-slate-600">{lead.phone ?? "—"}</td>}
                    {showOutcome && <td className="px-3 py-2 text-slate-600">{lead.last_outcome ?? "—"}</td>}
                    {showCallback && <td className="px-3 py-2 text-slate-600">{lead.callback_at ? new Date(lead.callback_at).toLocaleString() : "—"}</td>}
                    <td className="px-3 py-2">
                      {promotedId ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Promoted</span>
                      ) : (
                        <button type="button" disabled={isPending} onClick={() => runPromote(lead.id)} className="text-[12px] font-semibold text-sky-700 hover:underline">
                          Promote
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-900">Call Logs for this Segment</h2>
        </div>
        {callLogs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No calls logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {callLogs.map((log) => (
              <li key={log.id} className="px-3 py-2 text-[13px]">
                <span className="font-medium text-slate-800">{log.business_name}</span>
                {log.contact_name && <span className="text-slate-500"> · {log.contact_name}</span>}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{log.outcome}</span>
                <span className="ml-2 text-slate-500">{log.agent_name}</span>
                <span className="ml-2 text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                {log.notes && <p className="mt-0.5 text-slate-600">{log.notes}</p>}
                {log.callback_at && <p className="mt-0.5 text-[12px] text-orange-700">Callback: {new Date(log.callback_at).toLocaleString()}</p>}
                {log.appointment_at && <p className="mt-0.5 text-[12px] text-sky-700">Appointment: {new Date(log.appointment_at).toLocaleString()}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <RemovedRowsPanel segmentId={segment.id} initialRemovedLeads={removedLeads} restoreAction={restoreLeadsAction} />
    </div>
  );
}
