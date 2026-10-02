"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MONITORING_STATUS_STYLES, type MonitoringStatus } from "@/lib/leadgen-monitoring";
import type {
  OperationsMonitoringSummary,
  CommunicationFailureRecord,
  StaleLeadRecord,
  AppointmentRiskRecord,
  CallKpiAgentRecord,
  DataQualityIssue,
  CampaignActivityRecord,
} from "@/lib/leadgen-monitoring";

type AgentOption = { id: string; name: string };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "communications", label: "Communications" },
  { key: "stale-leads", label: "Stale Leads" },
  { key: "appointments", label: "Appointments" },
  { key: "agent-kpi", label: "Agent KPI" },
  { key: "data-quality", label: "Data Quality" },
  { key: "client-campaigns", label: "Client Campaigns" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function StatusBadge({ status }: { status: MonitoringStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${MONITORING_STATUS_STYLES[status]}`}>{status}</span>;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const selectClass = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700";

export default function OperationsMonitoringClient({
  summary,
  communications,
  staleLeads,
  appointments,
  agentKpi,
  dataQuality,
  campaigns,
  agents,
}: {
  summary: OperationsMonitoringSummary;
  communications: CommunicationFailureRecord[];
  staleLeads: StaleLeadRecord[];
  appointments: AppointmentRiskRecord[];
  agentKpi: CallKpiAgentRecord[];
  dataQuality: DataQualityIssue[];
  campaigns: CampaignActivityRecord[];
  agents: AgentOption[];
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [statusFilter, setStatusFilter] = useState<MonitoringStatus | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const filteredStaleLeads = useMemo(
    () => staleLeads.filter((r) => (statusFilter === "all" || r.status === statusFilter) && (agentFilter === "all" || r.assignedAgentId === agentFilter)),
    [staleLeads, statusFilter, agentFilter]
  );
  const filteredAppointments = useMemo(
    () =>
      appointments.filter(
        (r) => (statusFilter === "all" || r.monitoringStatus === statusFilter) && (agentFilter === "all" || r.assignedAgentId === agentFilter)
      ),
    [appointments, statusFilter, agentFilter]
  );
  const filteredCampaigns = useMemo(() => campaigns.filter((r) => statusFilter === "all" || r.status === statusFilter), [campaigns, statusFilter]);

  const showAgentFilter = tab === "stale-leads" || tab === "appointments";
  const showStatusFilter = tab === "stale-leads" || tab === "appointments" || tab === "client-campaigns";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(showStatusFilter || showAgentFilter) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {showStatusFilter && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Status
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as MonitoringStatus | "all")} className={selectClass}>
                <option value="all">All</option>
                <option value="Action Required">Action Required</option>
                <option value="Needs Attention">Needs Attention</option>
                <option value="Healthy">Healthy</option>
              </select>
            </label>
          )}
          {showAgentFilter && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Agent
              <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className={selectClass}>
                <option value="all">All Agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="mt-5">
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setTab(c.key === "email_sms" ? "communications" : c.key === "agent_kpi" ? "agent-kpi" : (c.key.replace(/_/g, "-") as TabKey))}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">{c.label}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900">
                  {c.key === "email_sms"
                    ? c.status === "Healthy" ? "Healthy" : `${communications.length} Recent Failures`
                    : c.key === "stale_leads" ? `${staleLeads.length} Stale Leads`
                    : c.key === "appointments" ? `${appointments.length} Appointments`
                    : c.key === "agent_kpi" ? "On Track"
                    : c.key === "data_quality" ? `${dataQuality.length} Data Quality Issues`
                    : c.key === "client_campaigns" ? `${campaigns.length} Campaigns Needing Attention`
                    : c.headline}
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === "communications" && (
          <Table
            emptyMessage="No email or SMS failures in the last 7 days."
            headers={["Type", "Recipient", "Related", "Status", "Detail", "When", "Retry"]}
            rows={communications.map((r) => [
              r.channel === "email" ? "Email" : "SMS",
              r.recipient,
              r.relatedHref && r.relatedLabel ? (
                <Link key="l" href={r.relatedHref} className="font-semibold text-sky-600 hover:text-sky-700">
                  {r.relatedLabel}
                </Link>
              ) : (
                (r.relatedLabel ?? "-")
              ),
              <span key="s" className="capitalize">{r.status}</span>,
              r.detail ?? "-",
              formatDateTime(r.occurredAt),
              r.retrySupported ? "Available in existing record" : "-",
            ])}
          />
        )}

        {tab === "stale-leads" && (
          <Table
            emptyMessage="No stale leads right now."
            headers={["Business", "Agent", "Last Activity", "Business Days Since", "Status"]}
            rows={filteredStaleLeads.map((r) => [
              <Link key="l" href={`/leadgen/admin/leads/${r.leadId}`} className="font-semibold text-sky-600 hover:text-sky-700">
                {r.businessName}
              </Link>,
              r.assignedAgentName ?? "Unassigned",
              formatDateTime(r.lastMeaningfulActivityAt),
              String(r.businessDaysSinceActivity),
              <StatusBadge key="st" status={r.status} />,
            ])}
          />
        )}

        {tab === "appointments" && (
          <Table
            emptyMessage="No appointment risks right now."
            headers={["Business", "Appointment", "Status", "Issues", "Monitoring"]}
            rows={filteredAppointments.map((r) => [
              r.businessName,
              r.appointmentDate,
              <span key="s" className="capitalize">{r.status}</span>,
              <ul key="f" className="list-disc space-y-0.5 pl-4">
                {r.flags.map((f) => (
                  <li key={f.code}>{f.label}</li>
                ))}
              </ul>,
              <StatusBadge key="st" status={r.monitoringStatus} />,
            ])}
          />
        )}

        {tab === "agent-kpi" && (
          <Table
            emptyMessage="No agents to show."
            headers={["Agent", "Calls Today", "Daily Target", "Pace"]}
            rows={agentKpi.map((r) => [
              r.agentName,
              String(r.callsToday),
              String(r.dailyTarget),
              <span key="p" className={r.pace === "Behind Pace" ? "font-semibold text-amber-700" : "text-slate-700"}>
                {r.pace}
              </span>,
            ])}
          />
        )}

        {tab === "data-quality" && (
          <Table
            emptyMessage="No data quality issues right now."
            headers={["Business", "Issues", "Actions"]}
            rows={dataQuality.map((r) => [
              r.businessName,
              <ul key="r" className="list-disc space-y-0.5 pl-4">
                {r.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>,
              <Link key="a" href={r.href} className="font-semibold text-sky-600 hover:text-sky-700">
                Review
              </Link>,
            ])}
          />
        )}

        {tab === "client-campaigns" && (
          <Table
            emptyMessage="Every active campaign has recent activity."
            headers={["Campaign", "Client", "Assigned Agents", "Last Activity", "Leads", "Appointments", "Status"]}
            rows={filteredCampaigns.map((r) => [
              <Link key="c" href={`/leadgen/admin/campaigns/${r.campaignId}`} className="font-semibold text-sky-600 hover:text-sky-700">
                {r.campaignName}
              </Link>,
              r.clientName,
              r.assignedAgentNames.length > 0 ? r.assignedAgentNames.join(", ") : "Unassigned",
              r.lastActivityAt ? formatDateTime(r.lastActivityAt) : "No recorded activity",
              String(r.leadsGenerated),
              String(r.appointmentsBooked),
              <StatusBadge key="st" status={r.status} />,
            ])}
          />
        )}
      </div>
    </div>
  );
}

function Table({ headers, rows, emptyMessage }: { headers: string[]; rows: React.ReactNode[][]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 align-top last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
