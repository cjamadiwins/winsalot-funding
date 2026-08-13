// Builds a standalone, self-contained pay-statement HTML document for
// "Download or print an individual pay statement" (admin) / "Pay
// Statement" (agent). Deliberately a plain string template rather than a
// React component rendered to a route: it's opened in its own browser tab
// via window.open()+document.write() (see openPayStatementWindow below)
// so the browser's native Print dialog - Save as PDF included - only ever
// sees this one statement, not the whole payroll page. Shared by both
// CRMs' payroll UIs; takes plain values rather than a PayrollRecord so it
// never needs to import either CRM's types.

import { formatNgn, formatPayPeriodLabel, formatDateLong, dailyRate, type PayrollStatus } from "./payroll";

export type PayStatementInput = {
  companyName: string;
  crmLabel: string; // "Cleaning CRM" or "Lead Generation CRM"
  agentName: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payday: string;
  standardBiweeklyPay: number;
  standardWorkingDays: number;
  daysPresent: number;
  approvedPaidDays: number;
  unpaidAbsenceDays: number;
  totalPayableDays: number;
  basePayEarned: number;
  incentiveBonus: number;
  otherAdditions: number;
  internetAllowance: number;
  deductions: number;
  totalPay: number;
  status: PayrollStatus;
  actualPaymentDate: string | null;
  paymentMethod: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function buildPayStatementHtml(input: PayStatementInput): string {
  const rate = dailyRate(input.standardBiweeklyPay, input.standardWorkingDays);
  const additions = input.otherAdditions + input.internetAllowance;

  const rows: [string, string][] = [
    ["Daily Rate", formatNgn(rate)],
    ["Days Present", String(input.daysPresent)],
    ["Approved Paid Days", String(input.approvedPaidDays)],
    ["Unpaid Absence Days", String(input.unpaidAbsenceDays)],
    ["Total Payable Days", String(input.totalPayableDays)],
    ["Base Pay Earned", formatNgn(input.basePayEarned)],
    ["Incentives / Bonuses", formatNgn(input.incentiveBonus)],
    ["Other Additions", formatNgn(additions)],
    ["Deductions", `-${formatNgn(input.deductions)}`],
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Pay Statement - ${escapeHtml(input.agentName)} - ${escapeHtml(input.payday)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 40px;
    background: #ffffff;
  }
  .statement { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin: 0 0 24px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; }
  .meta div { color: #475569; }
  .meta strong { display: block; color: #0f172a; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  td { padding: 8px 0; font-size: 14px; border-bottom: 1px solid #e2e8f0; }
  td:last-child { text-align: right; font-weight: 600; }
  .total-row td { border-top: 2px solid #0f172a; border-bottom: none; font-size: 17px; font-weight: 700; padding-top: 14px; }
  .status { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #f1f5f9; color: #334155; }
  .notes { margin-top: 20px; font-size: 13px; color: #475569; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="statement">
    <h1>${escapeHtml(input.companyName)}</h1>
    <p class="subtitle">${escapeHtml(input.crmLabel)} - Pay Statement</p>

    <div class="meta">
      <div>
        Agent
        <strong>${escapeHtml(input.agentName)}</strong>
      </div>
      <div>
        Pay Period
        <strong>${escapeHtml(formatPayPeriodLabel(input.payPeriodStart, input.payPeriodEnd))}</strong>
      </div>
      <div>
        Payday
        <strong>${escapeHtml(formatDateLong(input.payday))}</strong>
      </div>
    </div>

    <table>
      ${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("\n      ")}
      <tr class="total-row"><td>Final Net Payment</td><td>${escapeHtml(formatNgn(input.totalPay))}</td></tr>
    </table>

    <p>
      <span class="status">${escapeHtml(STATUS_LABELS[input.status])}</span>
      ${
        input.status === "paid" && input.actualPaymentDate
          ? ` &nbsp; Paid on ${escapeHtml(formatDateLong(input.actualPaymentDate))}${
              input.paymentMethod ? ` via ${escapeHtml(input.paymentMethod)}` : ""
            }`
          : ""
      }
    </p>
  </div>
</body>
</html>`;
}

// Opens the statement in a new tab and triggers the browser's Print
// dialog once it's finished loading - "Download or print" is satisfied by
// the dialog's own Save-as-PDF destination, without this app needing a
// PDF-generation dependency.
export function openPayStatementWindow(html: string): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}
