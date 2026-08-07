import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
import type { LeadgenUserRow } from "@/lib/leadgen-types";
import { getNextPayday, getUpcomingPaydays, type PayrollRecord } from "@/lib/payroll";
import AdminPayrollClient from "@/components/payroll/AdminPayrollClient";
import { createLeadgenPayrollAction, markLeadgenPayrollPaidAction, updateLeadgenPayrollAction } from "./actions";

export default async function LeadgenAdminPayrollPage() {
  await requireLeadgenAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: agents, error: agentsError }, { data: records, error: recordsError }] = await Promise.all([
    supabase.from("leadgen_users").select("*").eq("role", "agent").order("full_name"),
    supabase.from("leadgen_payroll").select("*").order("payday", { ascending: false }),
  ]);

  const error = agentsError ?? recordsError;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage biweekly pay records for Lead Generation CRM agents. Paid every 14 days in Nigerian
        Naira (₦).
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load payroll: {error.message}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <AdminPayrollClient
            agents={((agents ?? []) as LeadgenUserRow[]).map((a) => ({
              id: a.id,
              full_name: a.full_name,
              email: a.email,
            }))}
            records={(records ?? []) as PayrollRecord[]}
            nextPayday={getNextPayday()}
            upcomingPaydays={getUpcomingPaydays(4)}
            createAction={createLeadgenPayrollAction}
            updateAction={updateLeadgenPayrollAction}
            markPaidAction={markLeadgenPayrollPaidAction}
          />
        </div>
      )}
    </div>
  );
}
