import { INTEREST_LEVELS } from "@/lib/leadgen-appointment-prep";

const INTEREST_STYLES: Record<string, string> = {
  High: "text-emerald-700",
  Medium: "text-sky-700",
  "Early Interest": "text-amber-700",
};

// Extremely compact three-cell snapshot shared by the Admin prep modal and
// the Client Portal brief.
export default function OpportunitySnapshot({
  interestLevel,
  primaryNeed,
  objective,
}: {
  interestLevel: string | null;
  primaryNeed: string | null;
  objective: string | null;
}) {
  const level = interestLevel && (INTEREST_LEVELS as readonly string[]).includes(interestLevel) ? interestLevel : null;
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-[12.5px] sm:grid-cols-3">
      <div className="bg-white px-3 py-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Interest Level</p>
        <p className={`mt-0.5 font-semibold ${level ? INTEREST_STYLES[level] : "text-slate-400"}`}>{level ?? "Not set"}</p>
      </div>
      <div className="bg-white px-3 py-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Primary Need</p>
        <p className="mt-0.5 font-semibold text-slate-800">{primaryNeed || "Not set"}</p>
      </div>
      <div className="bg-white px-3 py-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Recommended Objective</p>
        <p className="mt-0.5 font-semibold text-slate-800">{objective || "Not set"}</p>
      </div>
    </div>
  );
}
