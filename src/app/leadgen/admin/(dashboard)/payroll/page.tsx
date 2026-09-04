import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import type { LeadgenUserRow } from "@/lib/leadgen-types";
import { getNextPayday, getUpcomingPaydays, sumPayrollRecordsByCurrency, type PayrollAuditLogRow, type PayrollRecord } from "@/lib/payroll";
import type { HolidayPayAssignmentRow, HolidayRow } from "@/lib/holiday-pay";
import { sumSubcontractorPaymentsByCurrency, type SubcontractorPaymentRow, type SubcontractorRow } from "@/lib/subcontractor-payroll";
import AdminPayrollClient from "@/components/payroll/AdminPayrollClient";
import HolidayPayAdminSection from "@/components/payroll/HolidayPayAdminSection";
import SubcontractorsAdminSection from "@/components/payroll/SubcontractorsAdminSection";
import PayrollCostSummary from "@/components/payroll/PayrollCostSummary";
import {
  approveLeadgenPayrollAction,
  cancelLeadgenPayrollAction,
  createLeadgenPayrollAction,
  loadLeadgenAttendanceSummaryAction,
  markLeadgenPayrollPaidAction,
  reopenLeadgenPayrollAction,
  updateLeadgenPayrollAction,
  updateLeadgenPayrollAgentCurrencyAction,
} from "./actions";
import {
  assignHolidayAction,
  createHolidayAction,
  deactivateHolidayAction,
  deleteHolidayAction,
  loadHolidayPaySummaryAction,
  overrideAssignmentAmountAction,
  reactivateHolidayAction,
  removeAssignmentAction,
  updateHolidayAction,
} from "./holiday-actions";
import {
  createSubcontractorAction,
  createSubcontractorPaymentAction,
  deactivateSubcontractorAction,
  reactivateSubcontractorAction,
  updateSubcontractorAction,
  updateSubcontractorPaymentAction,
} from "./subcontractor-actions";

export default async function LeadgenAdminPayrollPage() {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [
    { data: agents, error: agentsError },
    { data: records, error: recordsError },
    { data: auditLog, error: auditLogError },
    { data: holidays, error: holidaysError },
    { data: assignments, error: assignmentsError },
    { data: subcontractors, error: subcontractorsError },
    { data: subcontractorPayments, error: subcontractorPaymentsError },
    { data: clients, error: clientsError },
  ] = await Promise.all([
    supabase.from("leadgen_users").select("*").eq("role", "agent").order("full_name"),
    supabase.from("leadgen_payroll").select("*").order("payday", { ascending: false }),
    supabase.from("leadgen_payroll_audit_log").select("*").order("created_at", { ascending: false }),
    supabase.from("holidays").select("*").is("deleted_at", null).order("holiday_date", { ascending: false }),
    supabase.from("holiday_pay_assignments").select("*").not("leadgen_user_id", "is", null),
    supabase.from("leadgen_subcontractors").select("*").order("full_name"),
    supabase.from("leadgen_subcontractor_payments").select("*").order("period_start", { ascending: false }),
    supabase.from("leadgen_clients").select("id, name").order("name"),
  ]);

  const error =
    agentsError ?? recordsError ?? auditLogError ?? holidaysError ?? assignmentsError ??
    subcontractorsError ?? subcontractorPaymentsError ?? clientsError;

  const subcontractorRows = (subcontractors ?? []) as SubcontractorRow[];
  const subcontractorPaymentRows = (subcontractorPayments ?? []) as SubcontractorPaymentRow[];
  const subcontractorsById = new Map(subcontractorRows.map((s) => [s.id, s]));
  const agentCurrencyById = new Map(((agents ?? []) as LeadgenUserRow[]).map((a) => [a.id, a.payroll_currency]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage biweekly pay records for Lead Generation CRM agents. Paid every 14 days, in each agent&apos;s own
        Payroll Currency (set on their profile), driven by attendance and admin-approved day counts.
      </p>

      <nav aria-label="Payroll sections" className="mt-5 flex flex-wrap gap-2">
        <a
          href="#agent-payroll"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700"
        >
          Agent Payroll
        </a>
        <a
          href="#holiday-pay"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700"
        >
          Holiday Pay
        </a>
        <a
          href="#subcontractors"
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Subcontractors
        </a>
      </nav>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load payroll: {error.message}
        </p>
      )}

      {!error && (
        <div id="agent-payroll" className="mt-6 scroll-mt-6">
          <AdminPayrollClient
            companyName="Winsalot Corp"
            crmLabel="Lead Generation CRM"
            agents={((agents ?? []) as LeadgenUserRow[]).map((a) => ({
              id: a.id,
              full_name: a.full_name,
              email: a.email,
              payroll_currency: a.payroll_currency,
            }))}
            records={(records ?? []) as PayrollRecord[]}
            auditLog={(auditLog ?? []) as PayrollAuditLogRow[]}
            nextPayday={getNextPayday()}
            upcomingPaydays={getUpcomingPaydays(4)}
            loadAttendanceAction={loadLeadgenAttendanceSummaryAction}
            loadHolidayPayAction={loadHolidayPaySummaryAction}
            createAction={createLeadgenPayrollAction}
            updateAction={updateLeadgenPayrollAction}
            approveAction={approveLeadgenPayrollAction}
            markPaidAction={markLeadgenPayrollPaidAction}
            cancelAction={cancelLeadgenPayrollAction}
            reopenAction={reopenLeadgenPayrollAction}
            updateAgentCurrencyAction={updateLeadgenPayrollAgentCurrencyAction}
          />

          <div id="holiday-pay" className="mt-8 scroll-mt-6">
            <HolidayPayAdminSection
              crmLabel="Lead Generation CRM"
              agents={((agents ?? []) as LeadgenUserRow[]).map((a) => ({
                id: a.id,
                full_name: a.full_name,
                email: a.email,
                payroll_currency: a.payroll_currency,
              }))}
              holidays={(holidays ?? []) as HolidayRow[]}
              assignments={(assignments ?? []) as HolidayPayAssignmentRow[]}
              createHolidayAction={createHolidayAction}
              updateHolidayAction={updateHolidayAction}
              deactivateHolidayAction={deactivateHolidayAction}
              reactivateHolidayAction={reactivateHolidayAction}
              deleteHolidayAction={deleteHolidayAction}
              assignHolidayAction={assignHolidayAction}
              removeAssignmentAction={removeAssignmentAction}
              overrideAssignmentAmountAction={overrideAssignmentAmountAction}
            />
          </div>

          <div id="subcontractors" className="mt-8 scroll-mt-6">
            <SubcontractorsAdminSection
              crmLabel="Lead Generation CRM"
              subcontractors={subcontractorRows}
              payments={subcontractorPaymentRows}
              businessClients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
              createSubcontractorAction={createSubcontractorAction}
              updateSubcontractorAction={updateSubcontractorAction}
              deactivateSubcontractorAction={deactivateSubcontractorAction}
              reactivateSubcontractorAction={reactivateSubcontractorAction}
              createSubcontractorPaymentAction={createSubcontractorPaymentAction}
              updateSubcontractorPaymentAction={updateSubcontractorPaymentAction}
            />
          </div>

          <div className="mt-8">
            <PayrollCostSummary
              employeeTotals={sumPayrollRecordsByCurrency((records ?? []) as PayrollRecord[], agentCurrencyById)}
              subcontractorTotals={sumSubcontractorPaymentsByCurrency(subcontractorPaymentRows, subcontractorsById)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
