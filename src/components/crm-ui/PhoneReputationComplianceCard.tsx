import { Phone, ShieldCheck } from "lucide-react";

const rules = [
  "Use only approved Winsalot Corp Dialpad phone numbers.",
  "Increase call volume gradually on new or recently changed numbers.",
  "Never call a number on the shared Winsalot Corp Do Not Call List.",
  "Add a number to the shared Do Not Call List immediately if a prospect asks not to be contacted again.",
  "Avoid repeatedly calling the same prospect within a short period.",
  "Avoid unnecessary rapid back-to-back dialing.",
  "Keep Winsalot Corp business caller ID enabled and consistent.",
  "Report Spam, Scam Likely, or incorrect caller ID complaints to Admin immediately.",
  "Follow approved calling schedules, campaign assignments, and CRM call lists.",
  "Protecting phone reputation is every agent's responsibility.",
];

const statuses = [
  ["DNC Compliance", "Active"],
  ["Caller ID", "Winsalot Corp"],
  ["Spam Reports", "Report to Admin"],
  ["Calling Policy", "Active"],
] as const;

export default function PhoneReputationComplianceCard() {
  return (
    <section className="mt-4 rounded-2xl border border-sky-200 bg-[var(--crm-surface)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-sky-50 p-2 text-sky-700">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">Phone Reputation &amp; Compliance</h2>
            <Phone className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Help protect Winsalot Corp caller reputation and maintain compliant outbound calling.
          </p>

          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[12px] leading-5 text-slate-700 sm:grid-cols-2">
            {rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 sm:grid-cols-4">
            {statuses.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-0.5 text-[11.5px] font-semibold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-4 text-amber-900">
            <span className="font-bold">Admin Reminder:</span> Review caller-ID complaints, Do Not Call activity, unusual calling patterns, and agent call volume regularly.
          </p>
        </div>
      </div>
    </section>
  );
}
