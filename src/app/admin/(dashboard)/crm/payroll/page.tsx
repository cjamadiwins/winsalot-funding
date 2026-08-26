import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireCrmAdmin } from "@/lib/crm-auth";
import type { CrmUserRow } from "@/lib/crm-types";
import { getNextPayday, getUpcomingPaydays, type PayrollAuditLogRow, type PayrollRecord } from "@/lib/payroll";
import AdminPayrollClient from "@/components/payroll/AdminPayrollClient";
import {
  approvePayrollAction,
  cancelPayrollAction,
  createPayrollAction,
  loadAttendanceSummaryAction,
  markPayrollPaidAction,
  reopenPayrollAction,
  updatePayrollAction,
} from "./actions";

export default async function AdminCrmPayrollPage() {
  await requireCrmAdmin();
  const supabase = await createSupabaseServerClient();

  const [
    { data: agents, error: agentsError },
    { data: records, error: recordsError },
    { data: auditLog, error: auditLogError },
  ] = await Promise.all([
    supabase.from("crm_users").select("*").eq("role", "agent").order("full_name"),
    supabase.from("crm_payroll").select("*").order("payday", { ascending: false }),
    supabase.from("crm_payroll_audit_log").select("*").order("created_at", { ascending: false }),
  ]);

  const error = agentsError ?? recordsError ?? auditLogError;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage biweekly pay records for CRM agents. Paid every 14 days in Nigerian Naira (₦), driven by
        attendance and admin-approved day counts.
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
            crmLabel="Winsalot Growth CRM"
            agents={((agents ?? []) as CrmUserRow[]).map((a) => ({
              id: a.id,
              full_name: a.full_name,
              email: a.email,
            }))}
            records={(records ?? []) as PayrollRecord[]}
            auditLog={(auditLog ?? []) as PayrollAuditLogRow[]}
            nextPayday={getNextPayday()}
            upcomingPaydays={getUpcomingPaydays(4)}
            loadAttendanceAction={loadAttendanceSummaryAction}
            createAction={createPayrollAction}
            updateAction={updatePayrollAction}
            approveAction={approvePayrollAction}
            markPaidAction={markPayrollPaidAction}
            cancelAction={cancelPayrollAction}
            reopenAction={reopenPayrollAction}
          />
        </div>
      )}
    </div>
  );
}
