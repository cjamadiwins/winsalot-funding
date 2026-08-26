"use client";

import { useMemo, useState } from "react";

// Shared staff-facing slot picker - used by both the agent/admin "Book
// Consultation" modal (src/components/BookConsultationModal.tsx) and the
// Appointments list views' "Reschedule" action. Displays in the
// configured business timezone (staff operate in Winsalot's own business
// context) rather than a browser-local timezone, unlike the public
// booking page's prospect-facing picker.
export default function WinsalotSlotPicker({
  slotIsos,
  businessTimezone,
  selected,
  onSelect,
}: {
  slotIsos: string[];
  businessTimezone: string;
  selected: string | null;
  onSelect: (iso: string) => void;
}) {
  const days = useMemo(() => {
    const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: businessTimezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const labelFormatter = new Intl.DateTimeFormat("en-US", { timeZone: businessTimezone, weekday: "short", month: "short", day: "numeric" });
    const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: businessTimezone, hour: "numeric", minute: "2-digit" });

    const groups = new Map<string, { label: string; slots: { iso: string; label: string }[] }>();
    for (const iso of slotIsos) {
      const date = new Date(iso);
      const key = dateFormatter.format(date);
      if (!groups.has(key)) groups.set(key, { label: labelFormatter.format(date), slots: [] });
      groups.get(key)!.slots.push({ iso, label: timeFormatter.format(date) });
    }
    return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
  }, [slotIsos, businessTimezone]);

  const [selectedDay, setSelectedDay] = useState<string | null>(days[0]?.key ?? null);

  if (days.length === 0) {
    return <p className="text-sm text-slate-500">No availability right now.</p>;
  }

  return (
    <div>
      <p className="text-xs text-slate-500">Times shown in {businessTimezone.replace(/_/g, " ")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {days.map((day) => (
          <button
            key={day.key}
            type="button"
            onClick={() => setSelectedDay(day.key)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
              selectedDay === day.key ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {(days.find((d) => d.key === selectedDay)?.slots ?? []).map((slot) => (
          <button
            key={slot.iso}
            type="button"
            onClick={() => onSelect(slot.iso)}
            className={`rounded-lg border px-2 py-2 text-[12.5px] font-medium transition ${
              selected === slot.iso ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-sky-300"
            }`}
          >
            {slot.label}
          </button>
        ))}
      </div>
    </div>
  );
}
