import type { LeadgenAppointmentRow, LeadgenCampaignRow, LeadgenClientRow, LeadgenLeadRow } from "./leadgen-types";
import { isLeadgenAppointmentCountable } from "./leadgen-types";

export type LeadgenReportPeriod = { from: string; to: string };

export type LeadgenClientReport = {
  client: LeadgenClientRow;
  period: LeadgenReportPeriod;
  campaign: LeadgenCampaignRow | null;
  leadsAdded: number;
  leadsWorked: number;
  interestedLeads: number;
  followUps: number;
  appointmentsBooked: number;
  appointmentsCompleted: number;
  conversionRate: number;
  appointments: LeadgenAppointmentRow[];
  summary: string;
  nextStep: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function resolveLeadgenReportPeriod(from?: string | null, to?: string | null): LeadgenReportPeriod {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFromDate = new Date(today);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const defaultFrom = defaultFromDate.toISOString().slice(0, 10);

  const safeFrom = from && DATE_KEY.test(from) ? from : defaultFrom;
  const safeTo = to && DATE_KEY.test(to) ? to : defaultTo;
  return safeFrom <= safeTo ? { from: safeFrom, to: safeTo } : { from: safeTo, to: safeFrom };
}

function isoDateKey(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function inPeriod(value: string | null, period: LeadgenReportPeriod): boolean {
  const key = isoDateKey(value);
  return Boolean(key && key >= period.from && key <= period.to);
}

export function buildLeadgenClientReport(input: {
  client: LeadgenClientRow;
  period: LeadgenReportPeriod;
  leads: LeadgenLeadRow[];
  appointments: LeadgenAppointmentRow[];
  campaigns: LeadgenCampaignRow[];
}): LeadgenClientReport {
  const { client, period, leads, campaigns } = input;
  const appointments = input.appointments
    .filter((appointment) => appointment.appointment_date >= period.from && appointment.appointment_date <= period.to)
    .sort((a, b) => `${b.appointment_date}T${b.appointment_time}`.localeCompare(`${a.appointment_date}T${a.appointment_time}`));
  const leadsAdded = leads.filter((lead) => inPeriod(lead.created_at, period)).length;
  const leadsWorked = leads.filter((lead) => inPeriod(lead.last_contacted_at, period)).length;
  const interestedLeads = leads.filter((lead) => lead.status === "Interested" && inPeriod(lead.last_contacted_at, period)).length;
  const followUps = leads.filter((lead) => inPeriod(lead.next_follow_up_at, period)).length;
  const appointmentsBooked = appointments.filter((appointment) => isLeadgenAppointmentCountable(appointment.status)).length;
  const appointmentsCompleted = appointments.filter((appointment) => appointment.status === "Completed").length;
  const conversionRate = leadsWorked > 0 ? Math.round((appointmentsBooked / leadsWorked) * 1000) / 10 : 0;
  const campaign = campaigns.find((item) => item.status === "active") ?? campaigns[0] ?? null;

  const summary = `${leadsWorked} lead${leadsWorked === 1 ? " was" : "s were"} worked, ${interestedLeads} showed interest, and ${appointmentsBooked} appointment${appointmentsBooked === 1 ? " was" : "s were"} booked during this reporting period.`;
  const nextStep = appointmentsBooked > 0
    ? "Continue following up with interested leads and review the outcomes of booked appointments."
    : interestedLeads > 0
      ? "Prioritize the interested leads and convert their follow-ups into booked appointments."
      : "Continue outreach and refine targeting based on the responses received during this period.";

  return {
    client,
    period,
    campaign,
    leadsAdded,
    leadsWorked,
    interestedLeads,
    followUps,
    appointmentsBooked,
    appointmentsCompleted,
    conversionRate,
    appointments,
    summary,
    nextStep,
  };
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function leadgenClientReportCsv(report: LeadgenClientReport): string {
  const rows: Array<Array<string | number>> = [
    ["Winsalot Corp Client Performance Report"],
    ["Client", report.client.name],
    ["Period", `${report.period.from} to ${report.period.to}`],
    [],
    ["Metric", "Value"],
    ["Leads Added", report.leadsAdded],
    ["Leads Worked", report.leadsWorked],
    ["Interested Leads", report.interestedLeads],
    ["Follow-Ups", report.followUps],
    ["Appointments Booked", report.appointmentsBooked],
    ["Completed Appointments", report.appointmentsCompleted],
    ["Lead-to-Appointment Rate", `${report.conversionRate}%`],
    [],
    ["Appointment Date", "Time", "Business", "Contact", "Meeting Type", "Status"],
    ...report.appointments.map((appointment) => [
      appointment.appointment_date,
      appointment.appointment_time,
      appointment.business_name,
      appointment.contact_name ?? "",
      appointment.meeting_type,
      appointment.status,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function leadgenReportFilename(clientName: string, period: LeadgenReportPeriod, extension: "pdf" | "csv"): string {
  const safeName = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  return `${safeName}-performance-${period.from}-to-${period.to}.${extension}`;
}
