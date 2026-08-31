"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Inbox,
  Eye,
  CalendarCheck,
  DollarSign,
  Megaphone,
  Clock,
  Trophy,
} from "lucide-react";
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_STYLES,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  isOverdue,
  isDueToday,
  overdueDurationLabel,
  type CrmOpportunityRow,
  type CrmUserRow,
  type OpportunityStage,
  type OpportunityType,
} from "@/lib/crm-types";
import {
  CRM_RESULTS_DATE_FILTERS,
  CRM_RESULTS_DATE_FILTER_LABEL,
  crmResultsDateRange,
  isoInRange,
  type CrmResultsDateFilter,
} from "@/lib/crm-conversion";
import KpiCard, { type KpiTone } from "@/components/crm-ui/KpiCard";

const TYPE_BADGE_STYLES: Record<OpportunityType, string> = {
  lead_generation: "bg-teal-100 text-teal-800",
  business_financing: "bg-amber-100 text-amber-800",
  both_services: "bg-indigo-100 text-indigo-800",
};

type CardKey =
  | "total"
  | "new"
  | "interested"
  | "consultations"
  | "financing"
  | "leadgen"
  | "followups"
  | "won";

type FollowUpStatusFilter = "all" | "due_today" | "overdue" | "none";

export default function AdminCrmClient({
  opportunities,
  agents,
  initialCard = "total",
}: {
  opportunities: CrmOpportunityRow[];
  agents: CrmUserRow[];
  initialCard?: CardKey;
}) {
  const [search, setSearch] = useState("");
  const [activeCard, setActiveCard] = useState<CardKey>(initialCard);
  const [typeFilter, setTypeFilter] = useState<OpportunityType | "all">("all");
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<CrmResultsDateFilter>("all");
  const [industryFilter, setIndustryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [followUpStatusFilter, setFollowUpStatusFilter] = useState<FollowUpStatusFilter>("all");

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const dateRange = useMemo(() => crmResultsDateRange(dateFilter), [dateFilter]);

  // Each card's own count is always computed against the full, unfiltered
  // roster (matching the old file's stage tiles) - only the table below
  // reflects every active filter combined.
  const cardCounts: Record<CardKey, number> = {
    total: opportunities.length,
    new: opportunities.filter((o) => o.stage === "New Prospect").length,
    interested: opportunities.filter((o) => o.stage === "Interested").length,
    consultations: opportunities.filter((o) => o.stage === "Consultation Booked").length,
    financing: opportunities.filter(
      (o) => o.opportunity_type === "business_financing" || o.opportunity_type === "both_services"
    ).length,
    leadgen: opportunities.filter(
      (o) => o.opportunity_type === "lead_generation" || o.opportunity_type === "both_services"
    ).length,
    followups: opportunities.filter((o) => isOverdue(o) || isDueToday(o)).length,
    won: opportunities.filter((o) => o.stage === "Client Won").length,
  };

  const cards: { key: CardKey; label: string; tone: KpiTone; icon: typeof Users }[] = [
    { key: "total", label: "Total Prospects", tone: "blue", icon: Users },
    { key: "new", label: "New Prospects", tone: "indigo", icon: Inbox },
    { key: "interested", label: "Interested Prospects", tone: "cyan", icon: Eye },
    { key: "consultations", label: "Consultations Booked", tone: "purple", icon: CalendarCheck },
    { key: "financing", label: "Financing Opportunities", tone: "amber", icon: DollarSign },
    { key: "leadgen", label: "Lead Generation Opportunities", tone: "teal", icon: Megaphone },
    { key: "followups", label: "Follow-Ups Due", tone: "orange", icon: Clock },
    { key: "won", label: "Clients Won", tone: "green", icon: Trophy },
  ];

  function passesCard(o: CrmOpportunityRow): boolean {
    switch (activeCard) {
      case "new":
        return o.stage === "New Prospect";
      case "interested":
        return o.stage === "Interested";
      case "consultations":
        return o.stage === "Consultation Booked";
      case "financing":
        return o.opportunity_type === "business_financing" || o.opportunity_type === "both_services";
      case "leadgen":
        return o.opportunity_type === "lead_generation" || o.opportunity_type === "both_services";
      case "followups":
        return isOverdue(o) || isDueToday(o);
      case "won":
        return o.stage === "Client Won";
      case "total":
      default:
        return true;
    }
  }

  const query = search.trim().toLowerCase();
  const industryQuery = industryFilter.trim().toLowerCase();
  const locationQuery = locationFilter.trim().toLowerCase();

  const filtered = useMemo(() => {
    return opportunities.filter((opportunity) => {
      if (!passesCard(opportunity)) return false;
      if (typeFilter !== "all" && opportunity.opportunity_type !== typeFilter) return false;
      if (stageFilter !== "all" && opportunity.stage !== stageFilter) return false;
      if (agentFilter !== "all" && (opportunity.assigned_agent_id ?? "unassigned") !== agentFilter) {
        return false;
      }
      if (!isoInRange(opportunity.created_at, dateRange)) return false;
      if (industryQuery && !(opportunity.industry ?? "").toLowerCase().includes(industryQuery)) return false;
      if (
        locationQuery &&
        !(opportunity.city ?? "").toLowerCase().includes(locationQuery) &&
        !(opportunity.province_state ?? "").toLowerCase().includes(locationQuery)
      ) {
        return false;
      }
      if (followUpStatusFilter === "due_today" && !isDueToday(opportunity)) return false;
      if (followUpStatusFilter === "overdue" && !isOverdue(opportunity)) return false;
      if (followUpStatusFilter === "none" && opportunity.next_follow_up_at) return false;
      if (!query) return true;
      return (
        opportunity.business_name.toLowerCase().includes(query) ||
        (opportunity.contact_name ?? "").toLowerCase().includes(query) ||
        opportunity.phone.toLowerCase().includes(query) ||
        (opportunity.email ?? "").toLowerCase().includes(query)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opportunities,
    activeCard,
    typeFilter,
    stageFilter,
    agentFilter,
    dateRange,
    industryQuery,
    locationQuery,
    followUpStatusFilter,
    query,
  ]);

  return (
    <div id="all-opportunities" className="scroll-mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <KpiCard
            key={card.key}
            label={card.label}
            value={cardCounts[card.key]}
            tone={card.tone}
            icon={<card.icon />}
            hideIcon={card.key === "total"}
            active={activeCard === card.key}
            onClick={() => setActiveCard((current) => (current === card.key ? "total" : card.key))}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email..."
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as OpportunityType | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All types</option>
          {OPPORTUNITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {OPPORTUNITY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as OpportunityStage | "all")}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All stages</option>
          {OPPORTUNITY_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">All agents</option>
          <option value="unassigned">Unassigned</option>
          {agents
            .filter((a) => a.role === "agent" && a.active)
            .map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.full_name || agent.email}
              </option>
            ))}
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as CrmResultsDateFilter)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          {CRM_RESULTS_DATE_FILTERS.map((option) => (
            <option key={option} value={option}>
              {CRM_RESULTS_DATE_FILTER_LABEL[option]}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          placeholder="Industry"
          className="w-full max-w-[160px] rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <input
          type="text"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          placeholder="City or province"
          className="w-full max-w-[160px] rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        />
        <select
          value={followUpStatusFilter}
          onChange={(e) => setFollowUpStatusFilter(e.target.value as FollowUpStatusFilter)}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
        >
          <option value="all">Any follow-up status</option>
          <option value="due_today">Due today</option>
          <option value="overdue">Overdue</option>
          <option value="none">No follow-up scheduled</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Next Follow-up</th>
              <th className="px-4 py-3">Email Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((opportunity) => {
              const agent = opportunity.assigned_agent_id ? agentById.get(opportunity.assigned_agent_id) : null;
              const bounced =
                opportunity.last_email_status === "bounced" || opportunity.last_email_status === "complained";
              return (
                <tr
                  key={opportunity.id}
                  className={`border-b border-slate-100 last:border-0 ${
                    bounced ? "bg-rose-50" : isOverdue(opportunity) ? "bg-rose-50" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/admin/crm/opportunities/${opportunity.id}`} className="hover:text-sky-600">
                      {opportunity.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${TYPE_BADGE_STYLES[opportunity.opportunity_type]}`}
                    >
                      {OPPORTUNITY_TYPE_LABELS[opportunity.opportunity_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${OPPORTUNITY_STAGE_STYLES[opportunity.stage]}`}
                    >
                      {opportunity.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{agent?.full_name || agent?.email || "Unassigned"}</td>
                  <td className="px-4 py-3 text-slate-600">{opportunity.city || "—"}</td>
                  <td
                    className={`px-4 py-3 ${isOverdue(opportunity) ? "font-semibold text-rose-700" : "text-slate-600"}`}
                  >
                    {opportunity.next_follow_up_at
                      ? new Date(opportunity.next_follow_up_at).toLocaleString()
                      : "—"}
                    {isOverdue(opportunity) && opportunity.next_follow_up_at && (
                      <div className="text-xs font-normal">
                        {overdueDurationLabel(opportunity.next_follow_up_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {opportunity.last_email_status ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${EMAIL_STATUS_STYLES[opportunity.last_email_status]}`}
                      >
                        {EMAIL_STATUS_LABELS[opportunity.last_email_status]}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/crm/opportunities/${opportunity.id}`}
                      className="inline-flex rounded-full border border-sky-600 px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-600 hover:text-white"
                    >
                      Manage Prospect
                    </Link>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No opportunities match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
