"use client";

import { useEffect, useRef, useState } from "react";

export type ManageMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  hidden?: boolean;
  disabled?: boolean;
  danger?: boolean;
};

// A small "Manage" button + dropdown, used beside every invoice in the
// invoice list and every entry under Recent Payments. Only ever rendered
// from within the admin-only Growth CRM Invoices pages (requireCrmAdmin
// gates the whole route) - a regular agent can never reach the page this
// menu lives on, let alone see it.
export default function ManageMenu({ items }: { items: ManageMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visibleItems = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (visibleItems.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
      >
        Manage ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {visibleItems.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-4 py-2 text-left text-[12.5px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
