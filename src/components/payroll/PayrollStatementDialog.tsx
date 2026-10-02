"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function PayrollStatementDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="payroll-statement-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/55">
      <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 id="payroll-statement-title" className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold">Close</button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </dialog>
  );
}
