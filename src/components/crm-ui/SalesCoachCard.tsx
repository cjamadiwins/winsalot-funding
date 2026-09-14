"use client";

import { useState } from "react";
import Link from "next/link";
import { PhoneCall, ChevronRight, Users2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Modal from "@/components/Modal";
import {
  buildAgentCoachRecommendation,
  buildAgentHeadline,
  buildAgentRecommendedActions,
  buildAgentStatusMessage,
  buildCallLogCoachingNote,
  buildCallLogReminder,
  buildTeamHeadline,
  buildTeamOperationsPriority,
  buildTeamRecommendedActions,
  buildTeamStatusMessage,
  computeAgentStatusLevel,
  computeTeamStatusLevel,
  describeAgentCallLogStatus,
  SALES_COACH_STATUS_LABEL,
  teamAgentMainPriority,
  type SalesCoachAction,
  type SalesCoachAgentData,
  type SalesCoachStatusLevel,
  type SalesCoachTeamData,
} from "@/lib/sales-coach";

// Section 21: Green/On Track, Amber/Attention Needed, Red/Immediate
// Attention Required - one small palette shared by the banner's icon
// badge, status pill, and outer card accent so all three always agree.
// Amber runs one shade deeper than green/red across the board (600 instead
// of 500/100->700 instead of 100->700) since "Attention Needed" is the
// state agents are most likely to skim past if it isn't distinct enough
// from "On Track" - a deliberate, still-professional emphasis bump, not a
// color-scheme change.
const STATUS_STYLES: Record<SalesCoachStatusLevel, { accent: string; badgeBg: string; badgeText: string; pillBg: string; icon: typeof CheckCircle2 }> = {
  green: { accent: "border-l-emerald-500", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700", pillBg: "bg-emerald-600", icon: CheckCircle2 },
  amber: { accent: "border-l-amber-600", badgeBg: "bg-amber-200", badgeText: "text-amber-800", pillBg: "bg-amber-600", icon: AlertTriangle },
  red: { accent: "border-l-rose-500", badgeBg: "bg-rose-100", badgeText: "text-rose-700", pillBg: "bg-rose-600", icon: XCircle },
};

// Left accent border is a touch thicker than a standard card (5px vs. the
// dashboard's usual 4px) and the card carries a subtle shadow - together
// enough for the coach card to register a beat faster on first glance
// without changing its footprint, colors, or the rest of its layout.
function cardClassFor(level: SalesCoachStatusLevel): string {
  return `mt-6 rounded-2xl border border-slate-200 border-l-[5px] ${STATUS_STYLES[level].accent} bg-[var(--crm-surface)] p-5 shadow-sm`;
}

function StatusPill({ level }: { level: SalesCoachStatusLevel }) {
  const style = STATUS_STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold text-white ${style.pillBg}`}>
      {level === "green" ? "Green" : level === "amber" ? "Amber" : "Red"} — {SALES_COACH_STATUS_LABEL[level]}
    </span>
  );
}

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

function CardHeader({
  title,
  subtitle,
  level,
  onViewDetails,
}: {
  title: string;
  subtitle: string;
  level: SalesCoachStatusLevel;
  onViewDetails: () => void;
}) {
  const style = STATUS_STYLES[level];
  const StatusIcon = style.icon;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${style.badgeBg} ${style.badgeText}`}>
          <StatusIcon className="h-4 w-4" strokeWidth={2.3} />
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
  const now = new Date();
  const level = computeAgentStatusLevel(data, now);
  const statusMessage = buildAgentStatusMessage(data, level, now);
  const recommendation = buildAgentCoachRecommendation(data);
  const actions = buildAgentRecommendedActions(data);
  const callLogReminder = buildCallLogReminder(data.callLog, now);
  const callLogNote = buildCallLogCoachingNote(data.callLog);

  return (
    <section className={cardClassFor(level)}>
      <CardHeader
        title="Winsalot Sales Coach & Operations Manager"
        subtitle="Powered by your live CRM activity"
        level={level}
        onViewDetails={() => setDetailsOpen(true)}
      />

      <div className="mt-3">
        <StatusPill level={level} />
        <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-slate-800">{statusMessage}</p>
      </div>

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
                ? "border-amber-400 bg-amber-50"
                : "border-sky-200 bg-sky-50"
          }`}
        >
          <p
            className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
              callLogReminder.level === "active" ? "text-emerald-700" : callLogReminder.level === "strong" ? "text-amber-800" : "text-sky-700"
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
      <p className="text-slate-700">{buildAgentHeadline(data)}</p>

      <div className="mt-3 rounded-xl border border-slate-200 p-3.5">
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
  const now = new Date();
  const level = computeTeamStatusLevel(data, now);
  const statusMessage = buildTeamStatusMessage(data, level, now);
  const priority = buildTeamOperationsPriority(data);
  const actions = buildTeamRecommendedActions(data, { performanceHref });

  return (
    <section className={cardClassFor(level)}>
      <CardHeader
        title="Winsalot Sales Coach & Operations Manager — Team Overview"
        subtitle="Powered by your live CRM activity"
        level={level}
        onViewDetails={() => setDetailsOpen(true)}
      />

      <div className="mt-3">
        <StatusPill level={level} />
        <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-slate-800">{statusMessage}</p>
      </div>

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
      <p className="text-slate-700">{buildTeamHeadline(data)}</p>

      <div className="mt-3 rounded-xl border border-slate-200 p-3.5">
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
              <span className="flex items-center gap-2">
                {agent.presence.isPastExpectedClockIn && !agent.presence.isClockedIn && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Not Clocked In</span>
                )}
                <span className="text-[12px] text-slate-500">{describeAgentCallLogStatus(agent.callLog)}</span>
              </span>
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
