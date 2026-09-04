// Separate Employee/Agent Payroll, Subcontractor Payments, and Combined
// Payroll Cost totals, shown once per currency actually in use - never a
// single blended number, since this codebase never does FX conversion
// (see payroll.ts's formatCurrency / subcontractor-payroll.ts's
// formatSubcontractorCurrency) and summing e.g. NGN and USD together would
// be meaningless. A currency row only appears when at least one employee
// or subcontractor actually uses it.

import { formatSubcontractorCurrency, SUBCONTRACTOR_CURRENCIES, type SubcontractorCurrency } from "@/lib/subcontractor-payroll";
import type { PayrollCurrency } from "@/lib/payroll";

type Props = {
  employeeTotals: Partial<Record<PayrollCurrency, number>>;
  subcontractorTotals: Partial<Record<SubcontractorCurrency, number>>;
};

export default function PayrollCostSummary({ employeeTotals, subcontractorTotals }: Props) {
  // employeeTotals is only ever keyed by the 4 agent Payroll Currencies
  // (a strict subset of the 6 subcontractor currencies here) - widened to
  // a plain lookup since a currency this table iterates that no agent
  // uses (e.g. GBP) simply isn't a key in employeeTotals at all.
  const employeeTotalsByCurrency = employeeTotals as Partial<Record<SubcontractorCurrency, number>>;
  const currencies = SUBCONTRACTOR_CURRENCIES.filter(
    (currency) => (employeeTotalsByCurrency[currency] ?? 0) !== 0 || (subcontractorTotals[currency] ?? 0) !== 0
  );

  if (currencies.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
      <h2 className="text-lg font-bold text-slate-900">Payroll Cost Summary</h2>
      <p className="mt-1 text-sm text-slate-500">
        Employee/agent payroll and subcontractor payments are always kept separate and shown per currency - amounts
        are never converted or combined across currencies.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-4 font-medium">Currency</th>
              <th className="pb-2 pr-4 font-medium">Employee / Agent Payroll</th>
              <th className="pb-2 pr-4 font-medium">Subcontractor Payments</th>
              <th className="pb-2 font-medium">Combined Payroll Cost</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((currency) => {
              const employee = employeeTotalsByCurrency[currency] ?? 0;
              const subcontractor = subcontractorTotals[currency] ?? 0;
              return (
                <tr key={currency} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-4 font-semibold text-slate-900">{currency}</td>
                  <td className="py-2.5 pr-4 text-slate-800">{formatSubcontractorCurrency(employee, currency)}</td>
                  <td className="py-2.5 pr-4 text-slate-800">{formatSubcontractorCurrency(subcontractor, currency)}</td>
                  <td className="py-2.5 font-semibold text-slate-900">
                    {formatSubcontractorCurrency(employee + subcontractor, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
