"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, UserPlus, Sparkles, CalendarCheck2, Landmark, Megaphone, Clock, Trophy } from "lucide-react";
import {
  CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_STYLES,
  OPPORTUNITY_TYPE_LABELS,
  isOverdue,
  isDueToday,
  type CrmOpportunityRow,
  type OpportunityStage,
  type OpportunityType,
} from "@/lib/crm-types";
import KpiCard from "@/components/crm-ui/KpiCard";

type StageFilter = OpportunityStage | "all";
type TypeFilter = OpportunityType | "all";
type FollowUpFilter = "all" | "due_today" | "overdue";

// Matches a row against the type dropdown/KPI-card grouping: "lead_generation"
// and "business_financing" each include "both_services" (an opportunity
// selling both services is, by definition, also a Lead Generation
// opportunity and also a Business Financing opportunity), while
// "both_services" itself is a strict, both-only filter.
function matchesTypeFilter(opportunity: CrmOpportunityRow, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "both_services") return opportunity.opportunity_type === "both_services";
  return opportunity.opportunity_type === filter || opportunity.opportunity_type === "both_services";
}

export default function AgentDashboardClient({ opportunities }: { opportunities: CrmOpportunityRow[] }) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");

  const newProspects = opportunities.filter((o) => o.stage === "New Prospect").length;
  const interested = opportunities.filter((o) => o.stage === "Interested").length;
  const consultationsBooked = opportunities.filter((o) => o.stage === "Consultation Booked").length;
  const financing = opportunities.filter((o) => matchesTypeFilter(o, "business_financing")).length;
  const leadGen = opportunities.filter((o) => matchesTypeFilter(o, "lead_generation")).length;
  const followUpsDue = opportunities.filter((o) => isOverdue(o) || isDueToday(o)).length;
  const clientsWon = opportunities.filter((o) => o.stage === "Client Won").length;

  // Every card both scrolls to the table below AND seeds the same
  // client-side filter state the manual dropdowns use, so "8 clickable KPI
  // cards" and "filters over a table" are the same single mechanism rather
  // than two competing ones.
  function applyAndScroll(next: Partial<{ stage: StageFilter; type: TypeFilter; followUp: FollowUpFilter }>) {
    setStageFilter(next.stage ?? "all");
    setTypeFilter(next.type ?? "all");
    setFollowUpFilter(next.followUp ?? "all");
    document.getElementById("my-opportunities")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const stats = [
    {
      label: "Total Prospects",
      value: opportunities.length,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.total,
      icon: Users,
      onClick: () => applyAndScroll({}),
    },
    {
      label: "New Prospects",
      value: newProspects,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.newProspect,
      icon: UserPlus,
      onClick: () => applyAndScroll({ stage: "New Prospect" }),
    },
    {
      label: "Interested Prospects",
      value: interested,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.interested,
      icon: Sparkles,
      onClick: () => applyAndScroll({ stage: "Interested" }),
    },
    {
      label: "Consultations Booked",
      value: consultationsBooked,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.consultations,
      icon: CalendarCheck2,
      onClick: () => applyAndScroll({ stage: "Consultation Booked" }),
    },
    {
      label: "Financing Opportunities",
      value: financing,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.financing,
      icon: Landmark,
      onClick: () => applyAndScroll({ type: "business_financing" }),
    },
    {
      label: "Lead Generation Opportunities",
      value: leadGen,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.leadGen,
      icon: Megaphone,
      onClick: () => applyAndScroll({ type: "lead_generation" }),
    },
    {
      label: "Follow-Ups Due",
      value: followUpsDue,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.followUp,
      icon: Clock,
      onClick: () => applyAndScroll({ followUp: "due_today" }),
    },
    {
      label: "Clients Won",
      value: clientsWon,
      tone: CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.won,
      icon: Trophy,
      onClick: () => applyAndScroll({ stage: "Client Won" }),
    },
  ];

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return opportunities.filter((opportunity) => {
      if (stageFilter !== "all" && opportunity.stage !== stageFilter) return false;
      if (!matchesTypeFilter(opportunity, typeFilter)) return false;
      if (followUpFilter === "due_today" && !(isDueToday(opportunity) || isOverdue(opportunity))) return false;
      if (followUpFilter === "overdue" && !isOverdue(opportunity)) return false;
      if (!query) return true;
      return (
        opportunity.business_name.toLowerCase().includes(query) ||
        (opportunity.contact_name ?? "").toLowerCase().includes(query) ||
        opportunity.phone.toLowerCase().includes(query) ||
        (opportunity.email ?? "").toLowerCase().includes(query)
      );
    });
  }, [opportunities, query, stageFilter, typeFilter, followUpFilter]);

  return (
    <div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <KpiCard
            key={stat.label}
            onClick={stat.onClick}
            label={stat.label}
            value={stat.value}
            tone={stat.tone}
            icon={<stat.icon />}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business, contact, phone, email..."
          className="w-full max-w-sm rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All types</option>
          <option value="lead_generation">Lead Generation (incl. Both Services)</option>
          <option value="business_financing">Business Financing (incl. Both Services)</option>
          <option value="both_services">Both Services only</option>
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as StageFilter)}
          className="rounded-[10px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
        >
          <option value="all">All stages</option>
          {OPPORTUNITY_STAGES.map((stage) => (
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

      {opportunities.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No opportunities yet.{" "}
          <Link href="/agent/opportunities/new" className="font-semibold text-[var(--color-accent)]">
            Add your first opportunity
          </Link>{" "}
          to get started.
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[14px] text-[var(--color-text-muted)]">
          No opportunities match your filters.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full min-w-[720px] text-left text-[13.5px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--crm-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Next Follow-Up</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((opportunity) => (
                <tr
                  key={opportunity.id}
                  className={`border-b border-[var(--color-border-soft)] last:border-0 hover:bg-[var(--crm-surface-2)] ${
                    isOverdue(opportunity) ? "bg-red-50" : isDueToday(opportunity) ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/agent/opportunities/${opportunity.id}`}
                      className="font-semibold text-[var(--color-ink-strong)] hover:text-[var(--color-accent)]"
                    >
                      {opportunity.business_name}
                    </Link>
                    <div className="text-[12px] text-[var(--color-text-muted)]">
                      {opportunity.contact_name ? `${opportunity.contact_name} · ` : ""}
                      {opportunity.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-body)]">
                    {OPPORTUNITY_TYPE_LABELS[opportunity.opportunity_type]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${OPPORTUNITY_STAGE_STYLES[opportunity.stage]}`}
                    >
                      {opportunity.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-body)]">{opportunity.city || "—"}</td>
                  <td className="px-4 py-3">
                    {opportunity.next_follow_up_at ? (
                      <span className={isOverdue(opportunity) ? "font-medium text-red-700" : "text-[var(--color-text-body)]"}>
                        {new Date(opportunity.next_follow_up_at).toLocaleString()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
