"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentOverview, AssignmentProblems } from "@/lib/leadgen-campaign-assignment";
import { formatStatusLabel } from "@/lib/leadgen-types";

type ActionResult = { error?: string; removedFromLists?: number };

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  completed: "bg-slate-100 text-slate-700",
  draft: "bg-slate-100 text-slate-600",
  archived: "bg-slate-100 text-slate-500",
};

function Chip({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>{label}</span>;
}

export default function AssignmentsClient({
  overview,
  problems,
  setCampaignAgent,
  setSegmentAgent,
  setSegmentCampaign,
}: {
  overview: AssignmentOverview;
  problems: AssignmentProblems;
  setCampaignAgent: (campaignId: string, agentId: string, assigned: boolean, alsoRemoveFromLists?: boolean) => Promise<ActionResult>;
  setSegmentAgent: (segmentId: string, agentId: string, assigned: boolean) => Promise<ActionResult>;
  setSegmentCampaign: (segmentId: string, campaignId: string | null) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const campaignById = useMemo(() => new Map(overview.campaigns.map((c) => [c.id, c])), [overview.campaigns]);
  const agentName = useMemo(() => new Map(overview.agents.map((a) => [a.id, a.name])), [overview.agents]);
  const campaignsByClient = useMemo(() => {
    const map = new Map<string, { clientName: string; clientActive: boolean; isInternalTest: boolean; campaigns: AssignmentOverview["campaigns"] }>();
    for (const campaign of overview.campaigns) {
      const entry = map.get(campaign.clientId) ?? { clientName: campaign.clientName, clientActive: campaign.clientActive, isInternalTest: campaign.isInternalTest, campaigns: [] };
      entry.campaigns.push(campaign);
      map.set(campaign.clientId, entry);
    }
    return [...map.entries()].sort((a, b) => a[1].clientName.localeCompare(b[1].clientName));
  }, [overview.campaigns]);

  function run(action: () => Promise<ActionResult>, success?: (result: ActionResult) => string | null) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(success?.(result) ?? null);
      router.refresh();
    });
  }

  function toggleCampaignAgent(campaignId: string, agentId: string, assigned: boolean) {
    if (assigned) {
      run(() => setCampaignAgent(campaignId, agentId, true));
      return;
    }
    const listCount = overview.segments.filter((s) => s.campaignId === campaignId && s.agentIds.includes(agentId)).length;
    const alsoRemove =
      listCount > 0 &&
      window.confirm(`${agentName.get(agentId) ?? "This agent"} is also assigned to ${listCount} call list(s) for this campaign. Remove them from those lists too?\n\nOK = remove from the lists as well\nCancel = keep them on the lists`);
    run(
      () => setCampaignAgent(campaignId, agentId, false, alsoRemove),
      (r) => (r.removedFromLists ? `Also removed from ${r.removedFromLists} call list(s).` : null)
    );
  }

  function changeSegmentCampaign(segmentId: string, campaignId: string | null) {
    const segment = overview.segments.find((s) => s.id === segmentId);
    if (!segment) return;
    const next = campaignId ? campaignById.get(campaignId) : null;
    const previous = segment.campaignId ? campaignById.get(segment.campaignId) : null;
    if (previous && (previous.clientId !== next?.clientId) && (segment.callLogCount > 0 || segment.leadCount > 0)) {
      const label = next ? next.clientName : "Unassigned";
      if (
        !window.confirm(
          `Move "${segment.name}" from ${previous.clientName} to ${label}?\n\n${segment.callLogCount} existing call(s) stay recorded under ${previous.clientName}. Calls, emails and bookings made from this list from now on will be recorded under ${label}.${
            campaignId ? "" : "\n\nAgents will see \"Campaign Assignment Required\" and cannot make client-specific calls until it's assigned again."
          }`
        )
      ) {
        return;
      }
    } else if (!campaignId && !window.confirm(`Clear the client/campaign for "${segment.name}"? Agents will see "Campaign Assignment Required" until it's assigned again.`)) {
      return;
    }
    run(() => setSegmentCampaign(segmentId, campaignId));
  }

  const totalProblems = problems.unassignedProduction.length + problems.onInternalTestClient.length + problems.pausedOrInactive.length;
  const segmentsSorted = [...overview.segments].sort((a, b) => {
    const rank = (s: AssignmentOverview["segments"][number]) => {
      const campaign = s.campaignId ? campaignById.get(s.campaignId) : null;
      if (s.status === "active" || s.status === "completed") {
        if (!campaign) return 0;
        if (campaign.isInternalTest) return 1;
        return 3;
      }
      return 4;
    };
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-8">
      {totalProblems > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Needs your attention</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {problems.unassignedProduction.length > 0 && (
              <li>
                <strong>{problems.unassignedProduction.length}</strong> production call list(s) have no client/campaign - agents see &quot;Campaign Assignment
                Required&quot; and can&apos;t make client-specific calls.
              </li>
            )}
            {problems.onInternalTestClient.length > 0 && (
              <li>
                <strong>{problems.onInternalTestClient.length}</strong> production call list(s) are still linked to the internal test client - calls made from them
                are recorded under it. Reassign them to the right client below.
              </li>
            )}
            {problems.pausedOrInactive.length > 0 && (
              <li>
                <strong>{problems.pausedOrInactive.length}</strong> production call list(s) belong to a paused or inactive campaign/client - agents can&apos;t see them.
              </li>
            )}
          </ul>
        </div>
      )}

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}

      <section>
        <h2 className="text-base font-bold text-slate-900">Clients &amp; Campaigns → Agents</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">Tick the agents who work each client. (Agents assigned to a call list are added here automatically.)</p>
        <div className="mt-3 space-y-3">
          {campaignsByClient.map(([clientId, group]) => (
            <div key={clientId} className={`rounded-xl border border-slate-200 bg-white p-4 ${group.clientActive ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{group.clientName}</span>
                {!group.clientActive && <Chip label="Inactive client" className="bg-slate-100 text-slate-600" />}
                {group.isInternalTest && <Chip label="Internal test client" className="bg-violet-100 text-violet-800" />}
                <Link href={`/leadgen/admin/clients/${clientId}`} className="ml-auto text-[12px] text-sky-700 hover:underline">
                  Client settings
                </Link>
              </div>
              <div className="mt-2 divide-y divide-slate-100">
                {group.campaigns.map((campaign) => (
                  <div key={campaign.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <div className="min-w-[260px] flex-1 text-sm text-slate-700">
                      {campaign.name} <Chip label={formatStatusLabel(campaign.status)} className={STATUS_STYLES[campaign.status] ?? STATUS_STYLES.completed} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {overview.agents.map((agent) => (
                        <label key={agent.id} className="flex items-center gap-1.5 text-[13px] text-slate-700">
                          <input
                            type="checkbox"
                            disabled={isPending}
                            checked={campaign.agentIds.includes(agent.id)}
                            onChange={(e) => toggleCampaignAgent(campaign.id, agent.id, e.target.checked)}
                          />
                          {agent.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-slate-900">Call Lists → Client / Campaign → Agents</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Call list</th>
                <th className="px-3 py-2.5">Client / campaign</th>
                <th className="px-3 py-2.5">Agents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {segmentsSorted.map((segment) => {
                const campaign = segment.campaignId ? campaignById.get(segment.campaignId) : null;
                const production = segment.status === "active" || segment.status === "completed";
                const unassigned = !campaign;
                const warnAgents = campaign ? segment.agentIds.filter((id) => !campaign.agentIds.includes(id)) : [];
                return (
                  <tr key={segment.id} className={production && unassigned ? "bg-rose-50" : production && campaign?.isInternalTest ? "bg-amber-50" : ""}>
                    <td className="px-3 py-2.5 align-top">
                      <Link href={`/leadgen/admin/call-list-segments/${segment.id}`} className="font-medium text-slate-900 hover:text-sky-700 hover:underline">
                        {segment.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
                        <Chip label={formatStatusLabel(segment.status)} className={STATUS_STYLES[segment.status] ?? STATUS_STYLES.completed} />
                        {segment.leadCount} lead(s) · {segment.callLogCount} call(s) logged
                        {production && unassigned && <Chip label="Campaign assignment required" className="bg-rose-100 text-rose-800" />}
                        {production && campaign?.isInternalTest && <Chip label="On internal test client" className="bg-violet-100 text-violet-800" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <select
                        value={segment.campaignId ?? ""}
                        disabled={isPending}
                        onChange={(e) => changeSegmentCampaign(segment.id, e.target.value || null)}
                        className="w-full min-w-[260px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px]"
                      >
                        <option value="">— Unassigned —</option>
                        {campaignsByClient
                          // Test-only clients can never own production call lists, so they're not offered here
                          // (a list still on one keeps showing it so the control doesn't misreport its state).
                          .filter(([, group]) => !group.isInternalTest || group.campaigns.some((c) => c.id === segment.campaignId))
                          .map(([clientId, group]) => (
                          <optgroup key={clientId} label={`${group.clientName}${group.clientActive ? "" : " (inactive)"}`}>
                            {group.campaigns.filter((c) => !group.isInternalTest || c.id === segment.campaignId).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {c.status !== "active" ? ` (${formatStatusLabel(c.status)})` : ""}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {overview.agents.map((agent) => (
                          <label key={agent.id} className="flex items-center gap-1.5 text-[13px] text-slate-700">
                            <input
                              type="checkbox"
                              disabled={isPending}
                              checked={segment.agentIds.includes(agent.id)}
                              onChange={(e) => run(() => setSegmentAgent(segment.id, agent.id, e.target.checked))}
                            />
                            {agent.name}
                          </label>
                        ))}
                      </div>
                      {warnAgents.length > 0 && (
                        <p className="mt-1 text-[11.5px] text-amber-700">Not yet on this client: {warnAgents.map((id) => agentName.get(id) ?? "Unknown").join(", ")}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
