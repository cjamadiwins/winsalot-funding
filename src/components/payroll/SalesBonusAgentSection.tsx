import {
  SALES_BONUS_AGENT_STATUS_LABELS,
  SALES_BONUS_AGENT_STATUS_STYLES,
  formatBonusAmount,
  type AgentSalesBonusRow,
} from "@/lib/sales-bonus";
import { formatDateShort } from "@/lib/payroll";

// An agent's own earned Sales Conversion Bonuses. Deliberately shows no
// client billing information - only the bonus and its own payment status.
export default function SalesBonusAgentSection({ bonuses }: { bonuses: AgentSalesBonusRow[] }) {
  const sum = (status: AgentSalesBonusRow["agent_payment_status"][]) =>
    bonuses.filter((b) => status.includes(b.agent_payment_status)).reduce((total, b) => total + Math.round(Number(b.bonus_amount) * 100), 0) / 100;

  return (
    <section aria-labelledby="sales-bonus-heading" className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 id="sales-bonus-heading" className="text-lg font-bold text-slate-900">My Sales Conversion Bonuses</h2>
      <p className="mt-1 text-sm text-slate-500">
        CA$50 for each of your appointments that Admin confirms resulted in a sale. Bonuses are paid in CAD and are separate from your regular pay.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-amber-50 px-3 py-2"><p className="text-xs font-semibold uppercase text-amber-800">Pending</p><p className="text-lg font-bold text-amber-900">{formatBonusAmount(sum(["pending"]))}</p></div>
        <div className="rounded-xl bg-sky-50 px-3 py-2"><p className="text-xs font-semibold uppercase text-sky-800">Approved</p><p className="text-lg font-bold text-sky-900">{formatBonusAmount(sum(["approved"]))}</p></div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2"><p className="text-xs font-semibold uppercase text-emerald-800">Paid</p><p className="text-lg font-bold text-emerald-900">{formatBonusAmount(sum(["paid"]))}</p></div>
      </div>
      {bonuses.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No sales conversion bonuses yet. You earn one each time an appointment you booked is confirmed as a sale.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {bonuses.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-semibold text-slate-900">{b.business_name}</p>
                <p className="text-xs text-slate-500">
                  {b.client_name} · sale confirmed {formatDateShort(b.sale_confirmed_at.slice(0, 10))}
                  {b.payroll_payday ? ` · payroll ${formatDateShort(b.payroll_payday)}` : ""}
                  {b.agent_payment_status === "paid" && b.payment_date ? ` · paid ${formatDateShort(b.payment_date)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">{formatBonusAmount(b.bonus_amount, b.currency)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SALES_BONUS_AGENT_STATUS_STYLES[b.agent_payment_status]}`}>{SALES_BONUS_AGENT_STATUS_LABELS[b.agent_payment_status]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
