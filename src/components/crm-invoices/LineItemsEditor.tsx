"use client";

import { formatCurrency } from "@/lib/crm-clients-types";

export type LineItemDraft = { description: string; quantity: number; unit_price: number };

const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px] text-slate-900";

// Client-side array editor for an invoice's line items - the caller
// serializes the current array to JSON in a hidden field right before
// submit (see AdminInvoicesClient/InvoiceDetailClient's handleSubmit),
// since there is no line-item-by-line-item round trip to the server
// while editing, only a full replace on save.
export default function LineItemsEditor({
  items,
  onChange,
  currency,
}: {
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
  currency: string;
}) {
  function update(index: number, patch: Partial<LineItemDraft>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, { description: "", quantity: 1, unit_price: 0 }]);
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 w-24">Qty</th>
            <th className="px-3 py-2 w-32">Rate</th>
            <th className="px-3 py-2 w-32">Amount</th>
            <th className="px-3 py-2 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <tr key={index}>
              <td className="px-3 py-2">
                <input type="text" value={item.description} onChange={(e) => update(index, { description: e.target.value })} className={inputClass} placeholder="Service description" />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.quantity}
                  onChange={(e) => update(index, { quantity: Number(e.target.value) || 0 })}
                  className={inputClass}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unit_price}
                  onChange={(e) => update(index, { unit_price: Number(e.target.value) || 0 })}
                  className={inputClass}
                />
              </td>
              <td className="px-3 py-2 text-slate-700">{formatCurrency(item.quantity * item.unit_price, currency)}</td>
              <td className="px-3 py-2 text-right">
                <button type="button" onClick={() => remove(index)} className="text-rose-500 hover:text-rose-700">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
        <button type="button" onClick={add} className="text-[12.5px] font-semibold text-sky-600 hover:text-sky-700">
          + Add Line Item
        </button>
        <span className="text-[13px] font-semibold text-slate-700">Subtotal: {formatCurrency(subtotal, currency)}</span>
      </div>
    </div>
  );
}
