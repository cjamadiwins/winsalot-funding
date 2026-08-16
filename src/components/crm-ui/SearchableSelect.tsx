"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SearchableSelectOption = { value: string; label: string };

// Generic type-to-filter combobox: a text input that filters a dropdown
// list of options as you type, used for the "Edit Locations" province/
// state and city pickers (and reusable anywhere else a plain <select>
// would be too long to scan, e.g. all 50 U.S. states). Not a full ARIA
// combobox implementation - just enough keyboard support (arrow keys,
// Enter, Escape) to be usable without a mouse.
export default function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Search…",
  disabled = false,
}: {
  label: string;
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.value === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const filtered =
    query.trim().length === 0
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function pick(option: SearchableSelectOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setHighlight(0);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlight];
      if (option) pick(option);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[var(--crm-text-soft,#4b5c71)]">{label}</span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        placeholder={disabled ? "Select a country first" : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-[var(--crm-border,#dce4ec)] px-3.5 py-2.5 text-[14px] text-[var(--crm-text,#17283b)] disabled:cursor-not-allowed disabled:opacity-50"
      />
      {open && !disabled && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--crm-border,#dce4ec)] bg-[var(--crm-surface,#ffffff)] py-1 shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-3.5 py-2 text-[13.5px] text-[var(--crm-text-muted,#6b7c90)]">No matches</li>
          ) : (
            filtered.map((option, i) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option)}
                  className={`block w-full px-3.5 py-2 text-left text-[13.5px] ${
                    i === highlight ? "bg-[var(--crm-bg-2,#eaf0f6)]" : ""
                  } ${option.value === value ? "font-semibold text-[var(--crm-accent,#3e7ef7)]" : "text-[var(--crm-text,#17283b)]"}`}
                  onMouseEnter={() => setHighlight(i)}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
