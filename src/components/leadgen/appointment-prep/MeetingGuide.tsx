import { MEETING_GUIDE } from "@/lib/leadgen-appointment-prep";

// Small expandable 15-minute guide (native <details>, so it works in both
// server and client components and needs no state).
export default function MeetingGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <summary className="cursor-pointer text-[12.5px] font-semibold text-slate-700">15-Minute Appointment Guide</summary>
      <ol className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {MEETING_GUIDE.map((step) => (
          <li key={step.title} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-600">
            <span className="font-semibold text-slate-800">
              {step.time} · {step.title}
            </span>
            <span className="block">{step.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
