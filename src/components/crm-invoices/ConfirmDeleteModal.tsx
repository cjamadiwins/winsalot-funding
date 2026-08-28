"use client";

import { useState } from "react";

// A strong, typed confirmation for any permanent deletion in the
// Invoices/Payments Manage menus - shows the record number, client
// name, and amount up front, and requires the admin to type the literal
// word "DELETE" before the confirm button will do anything, regardless
// of how many times it's clicked.
export default function ConfirmDeleteModal({
  title,
  recordLabel,
  recordNumber,
  clientName,
  amountLabel,
  warning,
  isPending,
  onConfirm,
  onCancel,
}: {
  title: string;
  recordLabel: string;
  recordNumber: string;
  clientName: string;
  amountLabel: string;
  warning?: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText === "DELETE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-rose-700">{title}</h3>
        <p className="mt-1 text-[12.5px] text-slate-500">This action is permanent and cannot be undone.</p>

        <div className="mt-4 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-slate-800">
          <div className="flex justify-between">
            <span className="text-slate-500">{recordLabel}</span>
            <span className="font-semibold">{recordNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Client</span>
            <span className="font-semibold">{clientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Amount</span>
            <span className="font-semibold">{amountLabel}</span>
          </div>
        </div>

        {warning && <p className="mt-3 text-[12.5px] text-rose-700">{warning}</p>}

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[12px] font-medium text-slate-600">
            Type <span className="font-mono font-bold">DELETE</span> to confirm
          </span>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13.5px] text-slate-900"
            autoFocus
          />
        </label>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm || isPending}
            onClick={onConfirm}
            className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Permanently Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
