import type { LeadgenAppointmentRow, LeadgenCampaignRow, LeadgenClientRow, LeadgenLeadRow } from "./leadgen-types";
import { isLeadgenAppointmentCountable } from "./leadgen-types";

export type LeadgenReportPeriod = { from: string; to: string };

export type LeadgenClientReport = {
  client: LeadgenClientRow;
  period: LeadgenReportPeriod;
  campaign: LeadgenCampaignRow | null;
  leadsAdded: number;
  interestedLeads: number;
  appointmentsBooked: number;
  // Added for the Conversion Metrics breakdown (requirement #15) - both
  // scoped to the same reporting period as leadsAdded/appointmentsBooked
  // above, contacted-by-last_contacted_at and Completed-by-status
  // respectively.
  leadsContacted: number;
  appointmentsCompleted: number;
  appointments: LeadgenAppointmentRow[];
  summary: string;
  nextStep: string;
};

// Deeper, period-scoped conversion breakdown for the Reports page
// (requirement #15's "distinguish Contact Rate / Interested Rate /
// Lead-to-Appointment Conversion / Appointment Completion Rate" - kept off
// the Dashboard's single headline Conversion Rate KPI to stay compact
// there). Each ratio is independently period-scoped against the report's
// own already-derived counts, the same convention the report already uses
// for leadsAdded/interestedLeads/appointmentsBooked - not a strict
// lead-by-lead funnel across period boundaries.
export type LeadgenConversionBreakdown = {
  contactRate: number | null;
  interestedRate: number | null;
  leadToAppointmentRate: number | null;
  appointmentCompletionRate: number | null;
};

function ratioPct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

export function buildLeadgenConversionBreakdown(report: Pick<LeadgenClientReport, "leadsAdded" | "leadsContacted" | "interestedLeads" | "appointmentsBooked" | "appointmentsCompleted">): LeadgenConversionBreakdown {
  return {
    contactRate: ratioPct(report.leadsContacted, report.leadsAdded),
    interestedRate: ratioPct(report.interestedLeads, report.leadsContacted),
    leadToAppointmentRate: ratioPct(report.appointmentsBooked, report.leadsContacted),
    appointmentCompletionRate: ratioPct(report.appointmentsCompleted, report.appointmentsBooked),
  };
}

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

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function resolveLeadgenReportMonth(month?: string | null): { month: string; period: LeadgenReportPeriod } {
  const fallback = new Date().toISOString().slice(0, 7);
  const safeMonth = month && MONTH_KEY.test(month) ? month : fallback;
  const [year, monthNumber] = safeMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month: safeMonth,
    period: { from: `${safeMonth}-01`, to: `${safeMonth}-${String(lastDay).padStart(2, "0")}` },
  };
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
  const interestedLeads = leads.filter((lead) => lead.status === "Interested" && inPeriod(lead.last_contacted_at, period)).length;
  const appointmentsBooked = appointments.filter((appointment) => isLeadgenAppointmentCountable(appointment.status)).length;
  const leadsContacted = leads.filter((lead) => inPeriod(lead.last_contacted_at, period)).length;
  const appointmentsCompleted = appointments.filter((appointment) => appointment.status === "Completed").length;
  const campaign = campaigns.find((item) => item.status === "active") ?? campaigns[0] ?? null;

  const summary = `${leadsAdded} lead${leadsAdded === 1 ? " was" : "s were"} generated, ${interestedLeads} ${interestedLeads === 1 ? "was" : "were"} interested or qualified, and ${appointmentsBooked} appointment${appointmentsBooked === 1 ? " was" : "s were"} booked during this reporting period.`;
  const nextStep = appointmentsBooked > 0
    ? "Review the outcomes of booked appointments and continue progressing qualified opportunities."
    : interestedLeads > 0
      ? "Prioritize interested leads and progress them toward booked appointments."
      : "Refine targeting based on the results received during this period.";

  return {
    client,
    period,
    campaign,
    leadsAdded,
    interestedLeads,
    appointmentsBooked,
    leadsContacted,
    appointmentsCompleted,
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
    ["Winsalot Corp. Client Performance Report"],
    ["Client", report.client.name],
    ["Period", `${report.period.from} to ${report.period.to}`],
    [],
    ["Metric", "Value"],
    ["Leads Generated", report.leadsAdded],
    ["Interested / Qualified Leads", report.interestedLeads],
    ["Appointments Booked", report.appointmentsBooked],
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
