import type { LifecycleStep } from "@/lib/leadgen-appointment-prep";

// Booked → Brief Prepared → Brief Sent → Client Viewed → Completed → Feedback
export default function AppointmentLifecycle({ steps }: { steps: LifecycleStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11.5px]">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${step.done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"}`}>
            {step.done ? "✓ " : ""}
            {step.label}
          </span>
          {index < steps.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
    </ol>
  );
}
