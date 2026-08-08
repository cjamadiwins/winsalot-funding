"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CANADIAN_PROVINCES_AND_TERRITORIES,
  PROVIDER_ACQUISITION_STAGES,
  PROVIDER_ACQUISITION_STAGE_STYLES,
  PROVIDER_SERVICES_OFFERED,
  PROVIDER_STATUSES,
  PROVIDER_STATUS_STYLES,
  isProviderFollowUpDueToday,
  isProviderFollowUpOverdue,
  isProviderOverdue,
  providerAcquisitionStage,
  type ProviderAcquisitionStage,
  type ProviderFollowUpWithLead,
  type ProviderLeadRow,
  type ProviderStatus,
} from "@/lib/provider-types";
import { EMAIL_STATUS_LABELS, EMAIL_STATUS_STYLES, type CrmUserRow, type EmailEventStatus } from "@/lib/crm-types";
import CopyIntakeLinkButton from "@/components/CopyIntakeLinkButton";
import {
  assignProviderAgentAction,
  deleteProviderLeadAction,
  sendProviderIntakeEmailAction,
  updateProviderStatusAction,
} from "./actions";

export default function ProviderAcquisitionAdminClient({
  providers,
  agents,
  followUps,
}: {
  providers: ProviderLeadRow[];
  agents: CrmUserRow[];
  followUps: ProviderFollowUpWithLead[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProviderStatus | "all">("all");
  const [stageFilter, setStageFilter] = useState<ProviderAcquisitionStage | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [provinceFilter, setProvinceFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [emailStatusFilter, setEmailStatusFilter] = useState<EmailEventStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
    });
  }

  function handleSendIntake(provider: ProviderLeadRow) {
    if (!provider.email) return;
    if (!confirm(`Send the provider intake form email to ${provider.email}?`)) return;
    runAction(() => sendProviderIntakeEmailAction(provider.id));
  }

  const overdueFollowUps = useMemo(() => followUps.filter(isProviderFollowUpOverdue), [followUps]);
  const stageCounts = useMemo(() => {
    const counts = new Map<ProviderAcquisitionStage, number>();
    for (const stage of PROVIDER_ACQUISITION_STAGES) counts.set(stage, 0);
    for (const provider of providers) {
      const stage = providerAcquisitionStage(provider);
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return counts;
  }, [providers]);

  // Dashboard cards: New Interested Leads / Due Today / Overdue / Quote
  // Forms Sent / Quote Forms Incomplete / Qualified Providers / Closed –
  // Won / Closed – Lost - each with its own fixed color so the row reads
  // at a glance regardless of count (brief: "Use consistent colours for
  // dashboard cards"). Due Today/Overdue reuse the same
  // isProviderFollowUpDueToday/isProviderFollowUpOverdue pending-callback
  // logic already used everywhere else in this app, so a follow-up
  // completed here immediately drops out of both, same as before.
  const stats: { label: string; value: number; colorClass: string }[] = [
    { label: "New Interested Leads", value: stageCounts.get("New Interested Lead") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["New Interested Lead"] },
    { label: "Due Today", value: followUps.filter(isProviderFollowUpDueToday).length, colorClass: "bg-amber-100 text-amber-800" },
    { label: "Overdue", value: overdueFollowUps.length, colorClass: "bg-rose-100 text-rose-800" },
    { label: "Quote Forms Sent", value: stageCounts.get("Quote Form Sent") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Quote Form Sent"] },
    { label: "Quote Forms Incomplete", value: stageCounts.get("Quote Form Incomplete") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Quote Form Incomplete"] },
    { label: "Qualified Providers", value: stageCounts.get("Qualified Provider") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Qualified Provider"] },
    { label: "Closed – Won", value: stageCounts.get("Closed – Won") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Closed – Won"] },
    { label: "Closed – Lost", value: stageCounts.get("Closed – Lost") ?? 0, colorClass: PROVIDER_ACQUISITION_STAGE_STYLES["Closed – Lost"] },
  ];

  const byCity = useMemo(() => groupCount(providers, (p) => p.city), [providers]);
  const byProvince = useMemo(() => groupCount(providers, (p) => p.province), [providers]);
  const byService = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of providers) {
      for (const service of p.services_offered) {
        counts.set(service, (counts.get(service) ?? 0) + 1);
      }
    }
    return counts;
  }, [providers]);
  const byAgent = useMemo(
    () =>
      groupCount(providers, (p) => {
        const agent = p.assigned_agent_id ? agentById.get(p.assigned_agent_id) : null;
        return agent?.full_name || agent?.email || "Unassigned";
      }),
    [providers, agentById]
  );

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return providers.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (stageFilter !== "all" && providerAcquisitionStage(p) !== stageFilter) return false;
      if (agentFilter !== "all" && (p.assigned_agent_id ?? "unassigned") !== agentFilter) return false;
      if (provinceFilter !== "all" && p.province !== provinceFilter) return false;
      if (cityFilter && !p.city.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (serviceFilter !== "all" && !p.services_offered.includes(serviceFilter)) return false;
      if (emailStatusFilter !== "all" && p.last_email_status !== emailStatusFilter) return false;
      if (dateFrom && new Date(p.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(p.created_at) > new Date(`${dateTo}T23:59:59`)) return false;
      if (!query) return true;
      return (
        p.business_name.toLowerCase().includes(query) ||
        (p.contact_person ?? "").toLowerCase().includes(query) ||
        p.phone.toLowerCase().includes(query) ||
        (p.email ?? "").toLowerCase().includes(query) ||
        p.city.toLowerCase().includes(query) ||
        p.province.toLowerCase().includes(query) ||
        p.services_offered.some((s) => s.toLowerCase().includes(query))
      );
    });
  }, [
    providers,
    query,
    statusFilter,
    stageFilter,
    agentFilter,
    provinceFilter,
    cityFilter,
    serviceFilter,
    emailStatusFilter,
    dateFrom,
    dateTo,
  ]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-xl border border-transparent p-4 ${stat.colorClass}`}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">{stat.label}</div>
            <div className="mt-1 text-xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BreakdownCard title="Providers by City" counts={byCity} />
        <BreakdownCard title="Providers by Province" counts={byProvince} />
        <BreakdownCard title="Providers by Service Type" counts={byService} />
        <BreakdownCard title="Providers by Assigned Agent" counts={byAgent} />
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, contact, phone, email..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <input
          type="text"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          placeholder="City"
          className="w-full max-w-[140px] rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProviderStatus | "all")} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm">
          <option value="all">All statuses</option>
          {PROVIDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as ProviderAcquisitionStage | "all")} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm">
          <option value="all">All stages</option>
          {PROVIDER_ACQUISITION_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm">
          <option value="all">All agents</option>
          <option value="unassigned">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.full_name || agent.email}
            </option>
          ))}
        </select>
        <select value={provinceFilter} onChange={(e) => setProvinceFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm">
          <option value="all">All provinces</option>
          {CANADIAN_PROVINCES_AND_TERRITORIES.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </select>
        <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm">
          <option value="all">All services</option>
          {PROVIDER_SERVICES_OFFERED.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
        <select
          value={emailStatusFilter}
          onChange={(e) => setEmailStatusFilter(e.target.value as EmailEventStatus | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">Any email status</option>
          {Object.entries(EMAIL_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Created from
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          to
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">City / Province</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Email Status</th>
              <th className="px-4 py-3">Next Follow-up</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((provider) => {
              const agent = provider.assigned_agent_id ? agentById.get(provider.assigned_agent_id) : null;
              const bounced = provider.last_email_status === "bounced" || provider.last_email_status === "complained";
              return (
                <tr key={provider.id} className={`border-b border-slate-100 last:border-0 ${bounced || isProviderOverdue(provider) ? "bg-rose-50" : ""}`}>
                  <td className="px-4 py-3 text-slate-500">{new Date(provider.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={
                        provider.cleaning_provider_id
                          ? `/admin/providers/${provider.cleaning_provider_id}`
                          : `/admin/crm/provider-acquisition/${provider.id}`
                      }
                      className="hover:text-sky-600"
                    >
                      {provider.business_name}
                    </Link>
                    {provider.cleaning_provider_id && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Approved
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{provider.contact_person || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{provider.phone}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {provider.city}, {provider.province}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={provider.assigned_agent_id ?? ""}
                      disabled={isPending}
                      onChange={(e) => runAction(() => assignProviderAgentAction(provider.id, e.target.value || null))}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name || a.email}
                        </option>
                      ))}
                    </select>
                    {agent && <div className="mt-0.5 text-[10px] text-slate-400">Assigned to {agent.full_name || agent.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={provider.status}
                      disabled={isPending}
                      onChange={(e) => runAction(() => updateProviderStatusAction(provider.id, e.target.value))}
                      className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${PROVIDER_STATUS_STYLES[provider.status]}`}
                    >
                      {/* "Approved Provider" is reached only via "Approve and Add to Providers" on the detail page. */}
                      {PROVIDER_STATUSES.filter((s) => s !== "Approved Provider" || s === provider.status).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROVIDER_ACQUISITION_STAGE_STYLES[providerAcquisitionStage(provider)]}`}
                    >
                      {providerAcquisitionStage(provider)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {provider.last_email_status ? (
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${EMAIL_STATUS_STYLES[provider.last_email_status]}`}>
                        {EMAIL_STATUS_LABELS[provider.last_email_status]}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {provider.next_follow_up_at ? new Date(provider.next_follow_up_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={
                          provider.cleaning_provider_id
                            ? `/admin/providers/${provider.cleaning_provider_id}`
                            : `/admin/crm/provider-acquisition/${provider.id}`
                        }
                        className="text-xs font-medium text-sky-600 hover:text-sky-700"
                      >
                        Details
                      </Link>
                      <button
                        type="button"
                        disabled={isPending || !provider.email}
                        onClick={() => handleSendIntake(provider)}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Send Intake
                      </button>
                      <CopyIntakeLinkButton className="text-xs font-medium text-slate-500 hover:text-slate-700" />
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (confirm(`Permanently delete "${provider.business_name}"? This cannot be undone.`)) {
                            runAction(() => deleteProviderLeadAction(provider.id));
                          }
                        }}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  No provider leads match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function groupCount<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function BreakdownCard({ title, counts }: { title: string; counts: Map<string, number> }) {
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">No data yet.</p>
      ) : (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-700">
          {entries.map(([key, count]) => (
            <li key={key} className="flex justify-between gap-2">
              <span className="truncate">{key}</span>
              <span className="font-semibold text-slate-900">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
