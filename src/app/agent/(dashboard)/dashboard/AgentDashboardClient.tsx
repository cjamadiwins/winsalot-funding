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
  type OpportunityStage,
  type OpportunityType,
} from "@/lib/crm-types";
import CrmOpportunityRecordsModal from "@/components/crm-ui/CrmOpportunityRecordsModal";
import CrmConsultationRecordsModal from "@/components/crm-ui/CrmConsultationRecordsModal";
import { sortByMostRecentlyWon, sortByMostUrgentFollowUp, type OpportunityCardRecord } from "@/lib/crm-dashboard-records";
import type { ConsultationCardRecord } from "@/lib/winsalot-consultation-data";

type StageFilter = OpportunityStage | "all";
type TypeFilter = OpportunityType | "all";
type FollowUpFilter = "all" | "due_today" | "overdue";

// Matches a row against the type dropdown/KPI-card grouping: "lead_generation"
// and "business_financing" each include "both_services" (an opportunity
// selling both services is, by definition, also a Lead Generation
// opportunity and also a Business Financing opportunity), while
// "both_services" itself is a strict, both-only filter.
function matchesTypeFilter(opportunity: { opportunity_type: OpportunityType }, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "both_services") return opportunity.opportunity_type === "both_services";
  return opportunity.opportunity_type === filter || opportunity.opportunity_type === "both_services";
}

type NoteAction = (opportunityId: string, note: string) => Promise<{ error?: string }>;
type CompleteFollowUpAction = (followUpId: string, opportunityId: string) => Promise<{ error?: string } | void>;
type RescheduleAction = (followUpId: string, opportunityId: string, formData: FormData) => Promise<void>;

export default function AgentDashboardClient({
  opportunities,
  consultationRecords,
  onAddNote,
  onCompleteFollowUp,
  onReschedule,
}: {
  opportunities: OpportunityCardRecord[];
  consultationRecords: ConsultationCardRecord[];
  onAddNote: NoteAction;
  onCompleteFollowUp: CompleteFollowUpAction;
  onReschedule: RescheduleAction;
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");

  // Every card's number IS `records.length` for the exact array passed to
  // its drill-down modal - so a card's count and what clicking it shows
  // can never disagree. The table below is a separate, general browse/
  // search view (its own manual filters only, no longer tied to which
  // card was last clicked).
  const newRecords = useMemo(() => opportunities.filter((o) => o.stage === "New Prospect"), [opportunities]);
  const interestedRecords = useMemo(() => opportunities.filter((o) => o.stage === "Interested"), [opportunities]);
  const financingRecords = useMemo(() => opportunities.filter((o) => matchesTypeFilter(o, "business_financing")), [opportunities]);
  const leadGenRecords = useMemo(() => opportunities.filter((o) => matchesTypeFilter(o, "lead_generation")), [opportunities]);
  const followUpsDueRecords = useMemo(
    () => sortByMostUrgentFollowUp(opportunities.filter((o) => isOverdue(o) || isDueToday(o))),
    [opportunities]
  );
  const wonRecords = useMemo(() => sortByMostRecentlyWon(opportunities.filter((o) => o.stage === "Client Won")), [opportunities]);

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
        <CrmOpportunityRecordsModal
          label="Total Prospects"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.total}
          icon={<Users />}
          records={opportunities}
          opportunityHrefBase="/agent/opportunities"
          recordNoun="prospect"
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onReschedule={onReschedule}
        />
        <CrmOpportunityRecordsModal
          label="New Prospects"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.newProspect}
          icon={<UserPlus />}
          records={newRecords}
          opportunityHrefBase="/agent/opportunities"
          recordNoun="prospect"
          emptyMessage="No new prospects right now."
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onReschedule={onReschedule}
        />
        <CrmOpportunityRecordsModal
          label="Interested Prospects"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.interested}
          icon={<Sparkles />}
          records={interestedRecords}
          opportunityHrefBase="/agent/opportunities"
          recordNoun="prospect"
          emptyMessage="No interested prospects right now."
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onReschedule={onReschedule}
        />
        <CrmConsultationRecordsModal
          label="Consultations Booked"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.consultations}
          icon={<CalendarCheck2 />}
          records={consultationRecords}
          opportunityHrefBase="/agent/opportunities"
          appointmentsHref="/agent/appointments"
        />
        <CrmOpportunityRecordsModal
          label="Financing Opportunities"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.financing}
          icon={<Landmark />}
          records={financingRecords}
          opportunityHrefBase="/agent/opportunities"
          recordNoun="opportunity"
          emptyMessage="No financing opportunities right now."
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onReschedule={onReschedule}
        />
        <CrmOpportunityRecordsModal
          label="Lead Generation Opportunities"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.leadGen}
          icon={<Megaphone />}
          records={leadGenRecords}
          opportunityHrefBase="/agent/opportunities"
          recordNoun="opportunity"
          emptyMessage="No lead generation opportunities right now."
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onReschedule={onReschedule}
        />
        <CrmOpportunityRecordsModal
          label="Follow-Ups Due"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.followUp}
          icon={<Clock />}
          records={followUpsDueRecords}
          opportunityHrefBase="/agent/opportunities"
          recordNoun="follow-up"
          emptyMessage="No follow-ups due right now."
          onAddNote={onAddNote}
          onCompleteFollowUp={onCompleteFollowUp}
          onReschedule={onReschedule}
        />
        <CrmOpportunityRecordsModal
          label="Clients Won"
          tone={CRM_OPPORTUNITY_DASHBOARD_CARD_STYLES.won}
          icon={<Trophy />}
          records={wonRecords}
          opportunityHrefBase="/agent/opportunities"
          recordNoun="client"
          emptyMessage="No clients won yet."
          onAddNote={onAddNote}
        />
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
                <th className="px-4 py-3"></th>
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
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/agent/opportunities/${opportunity.id}`}
                      className="inline-flex rounded-full border border-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white"
                    >
                      Manage Prospect
                    </Link>
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
