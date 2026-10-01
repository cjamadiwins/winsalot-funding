const NAVY = "#10213f";
const MUTED = "#52627a";
const BORDER = "#dbe3ee";
const BLUE = "#2563eb";
const LOGO_URL = "https://growth.winsalotcorp.com/winsalot-logo.png";

export type AgentReportMetric = {
  label: string;
  result: number | string;
  goal?: number | string | null;
  rate?: number | null;
  informational?: boolean;
};

export type AgentReportSection = {
  title: "Growth CRM" | "Lead Generation CRM";
  overallPercentage: number;
  status: string;
  metrics: AgentReportMetric[];
  href: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[character] ?? character;
  });
}

function tone(rate: number | null | undefined, informational = false): { color: string; background: string } {
  if (informational || rate == null) return { color: BLUE, background: "#3b82f6" };
  if (rate >= 90) return { color: "#228a4b", background: "#34b566" };
  if (rate >= 70) return { color: "#bd7900", background: "#f2a51a" };
  return { color: "#d52f36", background: "#ef4444" };
}

function progressBar(rate: number, color: string, width = 100): string {
  const percent = Math.max(0, Math.min(100, Math.round(rate)));
  return `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:${width}px;height:10px;background:#e5e7eb;border-radius:8px"><tr><td width="${percent}%" style="height:10px;background:${color};border-radius:8px;font-size:0;line-height:0">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

export function renderAgentReportMetricRow(metric: AgentReportMetric): string {
  const selectedTone = tone(metric.rate, metric.informational);
  const displayRate = metric.rate == null ? "—" : `${Math.round(metric.rate)}%`;
  const bar = metric.rate == null ? "" : progressBar(metric.rate, selectedTone.background, 54);
  return `<tr>
    <td width="42%" style="padding:9px 8px;border-bottom:1px solid ${BORDER};color:#34445d;font-size:13px;line-height:17px">${escapeHtml(metric.label)}</td>
    <td width="18%" style="padding:9px 4px;border-bottom:1px solid ${BORDER};text-align:center;font-weight:700;color:${NAVY};font-size:13px">${escapeHtml(String(metric.result))}</td>
    <td width="15%" style="padding:9px 4px;border-bottom:1px solid ${BORDER};text-align:center;color:${MUTED};font-size:13px">${metric.goal == null ? "—" : escapeHtml(String(metric.goal))}</td>
    <td width="25%" style="padding:8px 6px;border-bottom:1px solid ${BORDER};color:${selectedTone.color};font-size:12px;font-weight:700;white-space:nowrap">${displayRate}${bar ? `<div style="margin-top:5px">${bar}</div>` : ""}</td>
  </tr>`;
}

export function renderAgentReportSection(section: AgentReportSection): string {
  const overallColor = section.overallPercentage >= 60 ? "#258c4c" : section.overallPercentage >= 40 ? "#bd7900" : "#d52f36";
  return `<table role="presentation" class="metric-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px;border:1px solid ${BORDER};border-radius:14px;border-collapse:separate;border-spacing:0;overflow:hidden">
    <tr><td colspan="4" style="padding:13px 15px;background:#f7f9fc">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-size:18px;font-weight:700;color:${NAVY}">${escapeHtml(section.title)}<div style="margin-top:4px;font-size:13px;font-weight:400;color:${MUTED}">Overall: <strong style="color:${overallColor}">${Math.round(section.overallPercentage)}%</strong> — <strong style="color:${overallColor}">${escapeHtml(section.status)}</strong></div></td>
        <td width="130" align="right" style="padding-left:8px">${progressBar(section.overallPercentage, overallColor, 112)}</td>
      </tr></table>
    </td></tr>
    <tr style="background:#edf3fb"><th width="42%" style="padding:8px;text-align:left;color:#30455f;font-size:12px">Metric</th><th width="18%" style="padding:8px 4px;color:#30455f;font-size:12px">Result</th><th width="15%" style="padding:8px 4px;color:#30455f;font-size:12px">Goal</th><th width="25%" style="padding:8px 6px;text-align:left;color:#30455f;font-size:12px">Rate</th></tr>
    ${section.metrics.map(renderAgentReportMetricRow).join("")}
    <tr><td colspan="4" style="padding:10px 12px"><a href="${escapeHtml(section.href)}" style="display:block;padding:11px 10px;background:#eaf2ff;border-radius:10px;color:${BLUE};text-align:center;text-decoration:none;font-size:14px;font-weight:700">View full ${escapeHtml(section.title)} report →</a></td></tr>
  </table>`;
}

export function renderAgentPerformanceEmail(input: {
  recipientName: string;
  periodTitle: "Weekly Agent Performance" | "Monthly Agent Performance";
  periodLabel: string;
  monthly?: boolean;
  sections: AgentReportSection[];
}): { subject: string; html: string; text: string } {
  const firstName = input.recipientName.trim().split(/\s+/)[0] || "Agent";
  const reportSections = input.sections.map((section) => ({
    ...section,
    href: input.monthly
      ? section.title === "Growth CRM"
        ? "https://growth.winsalotcorp.com/agent/performance/monthly"
        : "https://leads.winsalotcorp.com/leadgen/agent/performance/monthly"
      : section.href,
  }));
  const sectionsHtml = reportSections.map(renderAgentReportSection).join("");
  const textLines = [
    `Hi ${firstName}, here is your private performance report for ${input.periodLabel}.`,
    "",
    ...reportSections.flatMap((section) => [
      section.title,
      `Overall: ${Math.round(section.overallPercentage)}% — ${section.status}`,
      ...section.metrics.map((metric) => `${metric.label}: ${metric.result}${metric.goal == null ? "" : ` / ${metric.goal}`}${metric.rate == null ? "" : ` (${Math.round(metric.rate)}%)`}`),
      `View full ${section.title} report: ${section.href}`,
      "",
    ]),
    "Keep Going! Consistent activity leads to better results. Check the full report for detailed breakdowns, top opportunities, and next steps.",
    "",
    "Winsalot Corp.",
    "Empowering Businesses, One Solution at a Time.",
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:520px){.outer{padding:12px 7px!important}.inner{width:100%!important;box-sizing:border-box!important;padding:16px 11px!important}.brand-logo{width:150px!important}.report-title{font-size:23px!important}.metric-table th,.metric-table td{padding-left:4px!important;padding-right:4px!important;font-size:11px!important}.metric-table td:first-child{font-size:11px!important}.brand-line{font-size:12px!important}}</style></head><body style="margin:0;background:#f1f4f8;font-family:Arial,Helvetica,sans-serif;color:${NAVY}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f1f4f8"><tr><td align="center" class="outer" style="padding:24px 12px">
      <table role="presentation" width="720" cellpadding="0" cellspacing="0" border="0" class="inner" style="box-sizing:border-box;width:100%;max-width:720px;background:#ffffff;border-radius:18px;padding:23px 24px">
        <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="left"><img class="brand-logo" src="${LOGO_URL}" alt="Winsalot Corp. — Empowering Businesses, One Solution at a Time." width="188" style="display:block;width:188px;max-width:100%;height:auto;border:0"></td><td align="right" style="font-size:13px;line-height:20px;color:${MUTED}">${input.periodTitle.replace(" Agent Performance", " Performance Report")}<br><strong style="color:${NAVY}">${escapeHtml(input.periodLabel)}</strong></td></tr></table></td></tr>
        <tr><td align="center" style="padding:22px 2px 5px"><h1 class="report-title" style="margin:0 0 8px;font-size:27px;line-height:33px;color:${NAVY}">${escapeHtml(input.periodTitle)}</h1><p style="margin:0;color:${MUTED};font-size:15px;line-height:22px">Hi ${escapeHtml(firstName)}, here is your private performance report for <strong style="color:${NAVY}">${escapeHtml(input.periodLabel)}</strong>.</p></td></tr>
        <tr><td>${sectionsHtml}</td></tr>
        <tr><td style="padding-top:18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f6fd;border-radius:13px"><tr><td width="48" valign="top" style="padding:15px 0 15px 15px;font-size:23px">🏆</td><td style="padding:15px 15px 15px 9px"><strong style="font-size:16px;color:${NAVY}">Keep Going!</strong><div style="padding-top:5px;font-size:13px;line-height:19px;color:${MUTED}">Consistent activity leads to better results. Check the full report for detailed breakdowns, top opportunities, and next steps.</div></td></tr></table></td></tr>
        <tr><td align="center" class="brand-line" style="padding:14px 4px 0;color:${MUTED};font-size:12px;line-height:18px"><strong style="color:${NAVY}">Winsalot Corp.</strong> &nbsp;|&nbsp; Empowering Businesses, One Solution at a Time.</td></tr>
      </table>
    </td></tr></table></body></html>`;
  return {
    subject: `Your ${input.periodTitle.toLowerCase()} — ${input.periodLabel}`,
    html,
    text: textLines.join("\n"),
  };
}

export function countWeekdaysInclusive(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const final = Date.UTC(ey, em - 1, ed);
  let count = 0;
  while (cursor.getTime() <= final) {
    const weekday = cursor.getUTCDay();
    if (weekday >= 1 && weekday <= 5) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
