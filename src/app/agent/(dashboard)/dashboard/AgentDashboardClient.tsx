"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, UserPlus, Clock, AlertTriangle, ClipboardList } from "lucide-react";
import {
  CRM_LEAD_DASHBOARD_CARD_STYLES,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  LEAD_STAGES,
  LEAD_STAGE_STYLES,
  isOverdue,
  isDueToday,
  overdueDurationLabel,
  type CrmLeadRow,
  type LeadStage,
} from "@/lib/crm-types";
import KpiCard from "@/components/crm-ui/KpiCard";

type FollowUpFilter = "all" | "due_today" | "overdue";

export default function AgentDashboardClient({
  leads,
  initialStageFilter,
  initialFollowUpFilter,
}: {
  leads: CrmLeadRow[];
  // Pre-select a filter when landing here from the stat cards below -
  // ignored (falls back to "all") if not a recognized value, so a
  // stale/tampered URL never crashes this page.
  initialStageFilter?: string;
  initialFollowUpFilter?: "due_today" | "overdue";
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">(
    initialStageFilter && (LEAD_STAGES as readonly string[]).includes(initialStageFilter)
      ? (initialStageFilter as LeadStage)
      : "all"
  );
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>(initialFollowUpFilter ?? "all");

  const overdueLeads = useMemo(
    () =>
      leads
        .filter(isOverdue)
        .sort((a, b) => new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime()),
    [leads]
  );
  const dueToday = leads.filter(isDueToday).length;
  const overdue = overdueLeads.length;
  const newLeads = leads.filter((l) => l.stage === "New interested lead").length;
  const followUpRequired = leads.filter((l) => l.stage === "Follow-up required").length;

  const stats = [
    { label: "Total Leads", value: leads.length, href: "/agent/dashboard#my-leads", tone: CRM_LEAD_DASHBOARD_CARD_STYLES.total, icon: Users },
    {
      label: "New Leads",
      value: newLeads,
      href: `/agent/dashboard?stage=${encodeURIComponent("New interested lead")}#my-leads`,
      tone: CRM_LEAD_DASHBOARD_CARD_STYLES.newLead,
      icon: UserPlus,
    },
    {
      label: "Due Today",
      value: dueToday,
      href: "/agent/dashboard?followup=due_today#my-leads",
      tone: CRM_LEAD_DASHBOARD_CARD_STYLES.dueToday,
      icon: Clock,
    },
    {
      label: "Overdue",
      value: overdue,
      href: "/agent/dashboard?followup=overdue#my-leads",
      tone: CRM_LEAD_DASHBOARD_CARD_STYLES.overdue,
      icon: AlertTriangle,
    },
    {
      label: "Follow-up Required",
      value: followUpRequired,
      href: `/agent/dashboard?stage=${encodeURIComponent("Follow-up required")}#my-leads`,
      tone: CRM_LEAD_DASHBOARD_CARD_STYLES.followUp,
      icon: ClipboardList,
    },
  ];

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (stageFilter !== "all" && lead.stage !== stageFilter) return false;
      if (followUpFilter === "due_today" && !isDueToday(lead)) return false;
      if (followUpFilter === "overdue" && !isOverdue(lead)) return false;
      if (!query) return true;
      return (
        lead.business_name.toLowerCase().includes(query) ||
        (lead.contact_name ?? "").toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        (lead.email ?? "").toLowerCase().includes(query) ||
        lead.city.toLowerCase().includes(query)
      );
    });
  }, [leads, query, stageFilter, followUpFilter]);

  return (
    <div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat) => (
          <KpiCard key={stat.label} href={stat.href} label={stat.label} value={stat.value} tone={stat.tone} icon={<stat.icon />} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, city..."
          className="w-full max-w-sm rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as LeadStage | "all")}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All stages</option>
          {LEAD_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select
          value={followUpFilter}
          onChange={(e) => setFollowUpFilter(e.target.value as FollowUpFilter)}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All follow-ups</option>
          <option value="due_today">Due today</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {leads.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No leads yet.{" "}
          <Link href="/agent/leads/new" className="font-semibold text-[var(--color-accent)]">
            Add your first lead
          </Link>{" "}
          to get started.
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No leads match your search.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((lead) => {
            const bounced = lead.last_email_status === "bounced" || lead.last_email_status === "complained";
            return (
            <Link
              key={lead.id}
              href={`/agent/leads/${lead.id}`}
              className={`block rounded-xl border p-4 transition hover:border-[var(--color-accent)] ${
                bounced
                  ? "border-red-200 bg-red-50"
                  : isOverdue(lead)
                    ? "border-red-200 bg-red-50"
                    : isDueToday(lead)
                      ? "border-amber-200 bg-amber-50"
                      : "border-[var(--color-border)] bg-[var(--color-input-bg)]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-[var(--color-ink-strong)]">
                  {lead.business_name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {lead.last_email_status && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${EMAIL_STATUS_STYLES[lead.last_email_status]}`}
                    >
                      {EMAIL_STATUS_LABELS[lead.last_email_status]}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEAD_STAGE_STYLES[lead.stage]}`}
                  >
                    {lead.stage}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                {lead.contact_name ? `${lead.contact_name} · ` : ""}
                {lead.phone} · {lead.city}
              </div>
              {lead.next_follow_up_at && (
                <div
                  className={`mt-2 text-[12.5px] font-medium ${
                    isOverdue(lead) ? "text-red-700" : "text-[var(--color-text-muted)]"
                  }`}
                >
                  Next follow-up: {new Date(lead.next_follow_up_at).toLocaleString()}
                  {isOverdue(lead) && ` — ${overdueDurationLabel(lead.next_follow_up_at)}`}
                </div>
              )}
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
