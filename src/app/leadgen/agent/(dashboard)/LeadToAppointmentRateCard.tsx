"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import {
  LEADGEN_RESULTS_DATE_FILTERS,
  LEADGEN_RESULTS_DATE_FILTER_LABEL,
  computeLeadgenOverallConversion,
  formatConversionRate,
  isoInRange,
  leadgenResultsDateRange,
  type LeadgenResultsDateFilter,
} from "@/lib/leadgen-agent-results";
import KpiCard from "@/components/crm-ui/KpiCard";
import type { LeadgenLeadRow } from "@/lib/leadgen-types";

// Agent-facing counterpart to the admin dashboard's Lead-to-Appointment
// Rate KPI card (ResultsByAgentChart.tsx) - same formula, same Today/This
// Week/This Month/All Time filters, same one-decimal display and
// zero-leads-safe rate, but scoped to just the signed-in agent's own
// leads (already RLS-scoped by the caller, exactly like every other
// section of this dashboard) so an agent only ever sees their own rate.
export default function LeadToAppointmentRateCard({
  leads,
  serverNowIso,
}: {
  leads: Pick<LeadgenLeadRow, "id" | "business_name" | "status" | "created_at">[];
  serverNowIso: string;
}) {
  const [filter, setFilter] = useState<LeadgenResultsDateFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const now = useMemo(() => new Date(serverNowIso), [serverNowIso]);

  const conversion = useMemo(() => computeLeadgenOverallConversion(leads, filter, now), [leads, filter, now]);
  const range = useMemo(() => leadgenResultsDateRange(filter, now), [filter, now]);

  const bookedLeads = useMemo(
    () =>
      leads
        .filter((lead) => lead.status === "Appointment booked")
        .filter((lead) => isoInRange(lead.created_at, range)),
    [leads, range]
  );

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-cyan-700">Lead-to-Appointment Rate</h2>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
          {LEADGEN_RESULTS_DATE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                filter === option ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {LEADGEN_RESULTS_DATE_FILTER_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 max-w-xs">
        <KpiCard
          label="Lead-to-Appointment Rate"
          value={formatConversionRate(conversion.rate)}
          icon={<TrendingUp />}
          tone="cyan"
          active={expanded}
          onClick={() => setExpanded((v) => !v)}
        />
      </div>

      {expanded && (
        <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3.5">
          <div className="flex items-center justify-between text-[12px] font-semibold text-cyan-800">
            <span>Appointments booked — {LEADGEN_RESULTS_DATE_FILTER_LABEL[filter]}</span>
            <span className="tabular-nums">
              {conversion.appointmentsBooked} / {conversion.totalLeads}
            </span>
          </div>
          {bookedLeads.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-slate-500">No appointments booked in this period.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {bookedLeads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/leadgen/agent/leads/${lead.id}`}
                    className="text-[12.5px] font-medium text-sky-700 hover:text-sky-900 hover:underline"
                  >
                    {lead.business_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
