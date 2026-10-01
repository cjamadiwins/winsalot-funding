import { leadgenDateKey, type LeadgenPerformanceAppointment } from "./leadgen-performance";

export type ReportCallRow = { agent_id: string; created_at: string };
export type ReportEmailRow = {
  agent_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
};
export type ReportFollowUpRow = {
  agent_id: string | null;
  scheduled_at: string;
  status: "pending" | "completed";
};
export type ReportLeadRow = {
  assigned_agent_id: string | null;
  status: string;
  created_at: string;
};

export type GrowthEmailRow = { agent_id: string | null; sent_at: string | null; delivered_at: string | null };
export type GrowthFollowUpRow = { lead_id: string | null; opportunity_id: string | null; scheduled_at: string; status: "pending" | "completed" };
export type GrowthLeadOwnerRow = { id: string; assigned_agent_id: string | null };

export type PeriodActivity = {
  calls: number;
  emailsSent: number;
  emailsDelivered: number;
  emailDeliveryRate: number | null;
  followUpsDue: number;
  interestedLeads: number;
};

function inRange(value: string | null, start: string, end: string, dateKey: (value: string) => string): boolean {
  if (!value) return false;
  const key = dateKey(value);
  return key >= start && key <= end;
}

export function computeLeadgenReportActivity(input: {
  agentId: string;
  start: string;
  end: string;
  calls: ReportCallRow[];
  emails: ReportEmailRow[];
  followUps: ReportFollowUpRow[];
  leads: ReportLeadRow[];
}): PeriodActivity {
  const calls = input.calls.filter((row) => row.agent_id === input.agentId && inRange(row.created_at, input.start, input.end, leadgenDateKey)).length;
  const sent = input.emails.filter((row) => row.agent_id === input.agentId && inRange(row.sent_at, input.start, input.end, leadgenDateKey));
  const delivered = sent.filter((row) => row.delivered_at).length;
  const followUpsDue = input.followUps.filter(
    (row) => row.agent_id === input.agentId && row.status === "pending" && inRange(row.scheduled_at, input.start, input.end, leadgenDateKey)
  ).length;
  const interestedLeads = input.leads.filter(
    (row) => row.assigned_agent_id === input.agentId && row.status === "Interested" && inRange(row.created_at, input.start, input.end, leadgenDateKey)
  ).length;
  return {
    calls,
    emailsSent: sent.length,
    emailsDelivered: delivered,
    emailDeliveryRate: sent.length ? Math.round((delivered / sent.length) * 100) : null,
    followUpsDue,
    interestedLeads,
  };
}

export function countLeadgenAppointmentsInRange(
  appointments: LeadgenPerformanceAppointment[],
  agentId: string,
  start: string,
  end: string
): number {
  return appointments.filter((appointment) => {
    if (appointment.booking_agent_id !== agentId) return false;
    const key = leadgenDateKey(appointment.created_at);
    return key >= start && key <= end;
  }).length;
}

export function computeGrowthReportActivity(input: {
  agentId: string;
  start: string;
  end: string;
  emails: GrowthEmailRow[];
  followUps: GrowthFollowUpRow[];
  leads: GrowthLeadOwnerRow[];
  opportunityOwners: Map<string, string | null>;
}): Pick<PeriodActivity, "emailsSent" | "emailsDelivered" | "emailDeliveryRate" | "followUpsDue"> {
  const sent = input.emails.filter((row) => row.agent_id === input.agentId && inRange(row.sent_at, input.start, input.end, leadgenDateKey));
  const delivered = sent.filter((row) => row.delivered_at).length;
  const owners = new Map(input.leads.map((lead) => [lead.id, lead.assigned_agent_id] as const));
  const followUpsDue = input.followUps.filter((row) => {
    if (row.status !== "pending" || !inRange(row.scheduled_at, input.start, input.end, leadgenDateKey)) return false;
    const owner = row.lead_id ? owners.get(row.lead_id) : row.opportunity_id ? input.opportunityOwners.get(row.opportunity_id) : null;
    return owner === input.agentId;
  }).length;
  return {
    emailsSent: sent.length,
    emailsDelivered: delivered,
    emailDeliveryRate: sent.length ? Math.round((delivered / sent.length) * 100) : null,
    followUpsDue,
  };
}
