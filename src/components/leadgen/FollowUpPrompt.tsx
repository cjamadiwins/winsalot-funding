"use client";

import { useState } from "react";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

// "Would you like to schedule a follow-up?" (brief, shown immediately
// after a successful consultation email send). Quick relative-date
// options plus a custom date/time, or explicitly none.
export default function FollowUpPrompt({
  onSchedule,
  onSkip,
}: {
  onSchedule: (scheduledAtIso: string) => void;
  onSkip: () => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");

  function atTime(daysFromNow: number, hour = 10): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  }

  function nextWeek(): string {
    const date = new Date();
    const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + daysUntilMonday);
    date.setHours(10, 0, 0, 0);
    return date.toISOString();
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[14px] font-semibold text-slate-800">Would you like to schedule a follow-up?</p>
      {!showCustom ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <QuickButton label="Tomorrow" onClick={() => onSchedule(atTime(1))} />
          <QuickButton label="2 days" onClick={() => onSchedule(atTime(2))} />
          <QuickButton label="3 days" onClick={() => onSchedule(atTime(3))} />
          <QuickButton label="Next week" onClick={() => onSchedule(nextWeek())} />
          <QuickButton label="Custom date/time" onClick={() => setShowCustom(true)} />
          <button type="button" onClick={onSkip} className="rounded-full px-4 py-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700">
            No follow-up
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className={`${inputClass} max-w-[220px]`}
          />
          <button
            type="button"
            disabled={!customValue}
            onClick={() => onSchedule(new Date(customValue).toISOString())}
            className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Schedule
          </button>
          <button type="button" onClick={() => setShowCustom(false)} className="text-[13px] font-semibold text-slate-500">
            Back
          </button>
        </div>
      )}
    </div>
  );
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700">
      {label}
    </button>
  );
}
