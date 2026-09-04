import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import type { LeadgenUserRow } from "@/lib/leadgen-types";
import { getNextPayday, getUpcomingPaydays, type PayrollAuditLogRow, type PayrollRecord } from "@/lib/payroll";
import type { HolidayPayAssignmentRow, HolidayRow } from "@/lib/holiday-pay";
import AdminPayrollClient from "@/components/payroll/AdminPayrollClient";
import HolidayPayAdminSection from "@/components/payroll/HolidayPayAdminSection";
import {
  approveLeadgenPayrollAction,
  cancelLeadgenPayrollAction,
  createLeadgenPayrollAction,
  loadLeadgenAttendanceSummaryAction,
  markLeadgenPayrollPaidAction,
  reopenLeadgenPayrollAction,
  updateLeadgenPayrollAction,
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

export default async function LeadgenAdminPayrollPage() {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [
    { data: agents, error: agentsError },
    { data: records, error: recordsError },
    { data: auditLog, error: auditLogError },
    { data: holidays, error: holidaysError },
    { data: assignments, error: assignmentsError },
  ] = await Promise.all([
    supabase.from("leadgen_users").select("*").eq("role", "agent").order("full_name"),
    supabase.from("leadgen_payroll").select("*").order("payday", { ascending: false }),
    supabase.from("leadgen_payroll_audit_log").select("*").order("created_at", { ascending: false }),
    supabase.from("holidays").select("*").is("deleted_at", null).order("holiday_date", { ascending: false }),
    supabase.from("holiday_pay_assignments").select("*").not("leadgen_user_id", "is", null),
  ]);

  const error = agentsError ?? recordsError ?? auditLogError ?? holidaysError ?? assignmentsError;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage biweekly pay records for Lead Generation CRM agents. Paid every 14 days, in each agent&apos;s own
        Payroll Currency (set on their profile), driven by attendance and admin-approved day counts.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load payroll: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
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
          />

          <div className="mt-8">
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
        </div>
      )}
    </div>
  );
}
