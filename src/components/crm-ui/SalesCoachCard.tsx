"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, PhoneCall, ChevronRight, Users2 } from "lucide-react";
import Modal from "@/components/Modal";
import {
  buildAgentCoachRecommendation,
  buildAgentHeadline,
  buildAgentRecommendedActions,
  buildCallLogCoachingNote,
  buildCallLogReminder,
  buildTeamHeadline,
  buildTeamOperationsPriority,
  buildTeamRecommendedActions,
  describeAgentCallLogStatus,
  teamAgentMainPriority,
  type SalesCoachAction,
  type SalesCoachAgentData,
  type SalesCoachTeamData,
} from "@/lib/sales-coach";

const CARD_CLASS = "mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5";

function ActionList({ actions }: { actions: SalesCoachAction[] }) {
  if (actions.length === 0) {
    return <p className="mt-3 text-[13px] text-slate-500">Nothing needs your attention right now.</p>;
  }
  return (
    <ul className="mt-3 space-y-1.5">
      {actions.map((action) => (
        <li key={`${action.label}-${action.href}`}>
          <Link
            href={action.href}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
          >
            <span className="min-w-0 truncate">{action.label}</span>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.3} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CardHeader({ title, subtitle, onViewDetails }: { title: string; subtitle: string; onViewDetails: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Sparkles className="h-4 w-4" strokeWidth={2.3} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
          <p className="text-[11.5px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewDetails}
        className="flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-violet-700"
      >
        View Details
      </button>
    </div>
  );
}

function WeeklyProgressBar({ booked, target, label }: { booked: number; target: number; label: string }) {
  const percentage = target > 0 ? Math.min(100, Math.round((booked / target) * 100)) : 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11.5px] font-semibold text-slate-600">
        <span>{label}</span>
        <span>
          {booked} / {target}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// Agent Dashboard: personalized summary based only on the signed-in agent's
// own assigned CRM activity (section 1). "View Details" opens a compact
// modal (section 10) rather than a separate page.
export function SalesCoachAgentCard({ data }: { data: SalesCoachAgentData }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const headline = buildAgentHeadline(data);
  const recommendation = buildAgentCoachRecommendation(data);
  const actions = buildAgentRecommendedActions(data);
  const callLogReminder = buildCallLogReminder(data.callLog, new Date());
  const callLogNote = buildCallLogCoachingNote(data.callLog);

  return (
    <section className={CARD_CLASS}>
      <CardHeader title="Winsalot Sales Coach & Operations Manager" subtitle="Powered by your live CRM activity" onViewDetails={() => setDetailsOpen(true)} />

      <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700">{headline}</p>

      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Coach Recommendation</p>
        <p className="mt-1 text-[13px] text-violet-900">{recommendation}</p>
      </div>

      {callLogReminder && (
        <div
          className={`mt-3 rounded-xl border px-3.5 py-3 ${
            callLogReminder.level === "active"
              ? "border-emerald-200 bg-emerald-50"
              : callLogReminder.level === "strong"
                ? "border-amber-300 bg-amber-50"
                : "border-sky-200 bg-sky-50"
          }`}
        >
          <p
            className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
              callLogReminder.level === "active" ? "text-emerald-700" : callLogReminder.level === "strong" ? "text-amber-700" : "text-sky-700"
            }`}
          >
            <PhoneCall className="h-3.5 w-3.5" strokeWidth={2.3} />
            {callLogReminder.title}
          </p>
          <p className="mt-1 text-[13px] text-slate-700">{callLogReminder.message}</p>
          {callLogNote && <p className="mt-1 text-[12.5px] text-slate-500">{callLogNote}</p>}
        </div>
      )}

      <WeeklyProgressBar booked={data.weeklyPerformance.bookedThisWeek} target={data.weeklyPerformance.target} label={`Weekly appointment progress · ${data.weeklyPerformance.weekLabel}`} />

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended Actions</p>
      <ActionList actions={actions} />

      {detailsOpen && (
        <Modal title="Winsalot Sales Coach & Operations Manager" onClose={() => setDetailsOpen(false)}>
          <AgentDetails data={data} />
        </Modal>
      )}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-[13px] last:border-b-0">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function AgentDetails({ data }: { data: SalesCoachAgentData }) {
  return (
    <div className="text-[13.5px]">
      <div className="rounded-xl border border-slate-200 p-3.5">
        <DetailRow label="Hot Opportunities" value={data.hot.length} />
        <DetailRow label="Warm Opportunities" value={data.warm.length} />
        <DetailRow label="Follow-ups/Callbacks Due Today" value={data.followUpsDueToday.length} />
        <DetailRow label="Overdue Follow-ups/Callbacks" value={data.followUpsOverdue.length} />
        <DetailRow label="Appointments Today" value={data.appointmentsToday.length} />
        <DetailRow label="Appointments Tomorrow" value={data.appointmentsTomorrow.length} />
        <DetailRow label="Appointment Reminder Issues" value={data.reminderIssues.length} />
        <DetailRow label="Interested Prospects Needing Action" value={data.interestedNeedingAction.length} />
        <DetailRow label="Warm Opportunities With No Recent Activity" value={data.staleWarmOpportunities.length} />
        <DetailRow label="Calls Logged Today" value={data.callLog.countToday} />
      </div>

      {data.reminderIssues.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Appointment Reminder Issues</p>
          <ul className="mt-2 space-y-1.5">
            {data.reminderIssues.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 hover:bg-amber-100">
                  {item.businessName} — {item.reminderIssue}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended Actions</p>
      <ActionList actions={buildAgentRecommendedActions(data)} />
    </div>
  );
}

// Admin Dashboard: complete team version (section 2) - every active agent's
// counts and coaching summary, filterable in the modal, admin can open any
// agent's own detail from here.
export function SalesCoachAdminCard({ data, performanceHref }: { data: SalesCoachTeamData; performanceHref: string }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const headline = buildTeamHeadline(data);
  const priority = buildTeamOperationsPriority(data);
  const actions = buildTeamRecommendedActions(data, { performanceHref });

  return (
    <section className={CARD_CLASS}>
      <CardHeader
        title="Winsalot Sales Coach & Operations Manager — Team Overview"
        subtitle="Powered by your live CRM activity"
        onViewDetails={() => setDetailsOpen(true)}
      />

      <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700">{headline}</p>

      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Operations Priority</p>
        <p className="mt-1 text-[13px] text-violet-900">{priority}</p>
      </div>

      <WeeklyProgressBar booked={data.teamWeeklyBooked} target={data.teamWeeklyTarget} label="Team weekly appointment progress" />

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended Actions</p>
      <ActionList actions={actions} />

      {detailsOpen && (
        <Modal title="Winsalot Sales Coach & Operations Manager — Team Overview" onClose={() => setDetailsOpen(false)}>
          <AdminDetails data={data} performanceHref={performanceHref} />
        </Modal>
      )}
    </section>
  );
}

function AdminDetails({ data, performanceHref }: { data: SalesCoachTeamData; performanceHref: string }) {
  return (
    <div className="text-[13.5px]">
      <div className="rounded-xl border border-slate-200 p-3.5">
        <DetailRow label="Team Hot Opportunities" value={data.teamHot} />
        <DetailRow label="Team Warm Opportunities" value={data.teamWarm} />
        <DetailRow label="Overdue Follow-ups/Callbacks" value={data.teamFollowUpsOverdue} />
        <DetailRow label="Follow-ups/Callbacks Due Today" value={data.teamFollowUpsDueToday} />
        <DetailRow label="Appointments Today" value={data.teamAppointmentsToday.length} />
        <DetailRow label="Appointments Tomorrow" value={data.teamAppointmentsTomorrow.length} />
        <DetailRow label="Reminder Issues" value={data.teamReminderIssues.length} />
        <DetailRow label="Team Weekly Booked / Target" value={`${data.teamWeeklyBooked} / ${data.teamWeeklyTarget}`} />
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Users2 className="h-3.5 w-3.5" strokeWidth={2.3} />
        Performance By Agent
      </p>
      <div className="mt-2 space-y-2">
        {data.agents.map((agent) => (
          <div key={agent.agentId} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={agent.agentHref} className="font-semibold text-sky-700 hover:text-sky-800">
                {agent.agentName}
              </Link>
              <span className="text-[12px] text-slate-500">{describeAgentCallLogStatus(agent.callLog)}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-slate-600">{teamAgentMainPriority(agent)}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
              <span>Hot: {agent.hotCount}</span>
              <span>Warm: {agent.warmCount}</span>
              <span>Overdue: {agent.followUpsOverdueCount}</span>
              <span>Due Today: {agent.followUpsDueTodayCount}</span>
              <span>Today: {agent.appointmentsTodayCount}</span>
              <span>Tomorrow: {agent.appointmentsTomorrowCount}</span>
              <span>
                Weekly: {agent.weeklyBooked}/{agent.weeklyTarget}
              </span>
            </div>
          </div>
        ))}
        {data.agents.length === 0 && <p className="text-[13px] text-slate-500">No active agents.</p>}
      </div>

      {data.teamReminderIssues.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Appointment Reminder Issues</p>
          <ul className="mt-2 space-y-1.5">
            {data.teamReminderIssues.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 hover:bg-amber-100">
                  {item.businessName} — {item.reminderIssue}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended Actions</p>
      <ActionList actions={buildTeamRecommendedActions(data, { performanceHref })} />
    </div>
  );
}
