"use client";

import { useState } from "react";
import type { ProviderIntakeVersionRow } from "@/lib/provider-types";

const FIELD_LABELS: Record<string, string> = {
  businessName: "Business Name",
  contactPerson: "Contact Person",
  email: "Email",
  phone: "Phone",
  city: "City",
  province: "Province",
  website: "Website",
  servicesOffered: "Services Offered",
  yearsInBusiness: "Years in Business",
  notes: "Additional Notes",
};

function renderAnswers(submission: Record<string, unknown>) {
  return Object.entries(submission).map(([key, value]) => {
    const label = FIELD_LABELS[key] ?? key;
    const display = Array.isArray(value) ? value.join(", ") : String(value ?? "—");
    if (!display) return null;
    return (
      <div key={key} className="flex justify-between gap-4 border-b border-slate-100 py-1.5 last:border-0">
        <dt className="text-slate-500">{label}</dt>
        <dd className="text-right font-medium text-slate-900">{display}</dd>
      </div>
    );
  });
}

// Provider Intake Form (brief "PROVIDER INTAKE FORM") - every submitted
// answer, plus full version history if the provider later resubmits.
export default function ProviderIntakeFormCard({
  submission,
  completedAt,
  versions,
}: {
  submission: Record<string, unknown> | null;
  completedAt: string | null;
  versions: ProviderIntakeVersionRow[];
}) {
  const [showHistory, setShowHistory] = useState(false);

  if (!submission) {
    return (
      <section id="intake-form" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Provider Intake Form</h2>
        <p className="mt-3 text-[13.5px] text-slate-500">Not completed yet.</p>
      </section>
    );
  }

  return (
    <section id="intake-form" className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Provider Intake Form</h2>
      <p className="mt-1 text-[12px] text-slate-500">
        Completed On: {completedAt ? new Date(completedAt).toLocaleString() : "—"} · Completed By: Provider (self-submitted)
      </p>
      <dl className="mt-3 text-[13px]">{renderAnswers(submission)}</dl>

      {versions.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-[12.5px] font-semibold text-sky-600">
            {showHistory ? "Hide" : "Show"} version history ({versions.length})
          </button>
          {showHistory && (
            <div className="mt-3 space-y-3">
              {versions.map((version) => (
                <div key={version.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[12px] font-semibold text-slate-600">
                    Completed {new Date(version.completed_at).toLocaleString()}
                    {version.completed_by_label ? ` by ${version.completed_by_label}` : ""}
                  </p>
                  <dl className="mt-2 text-[12.5px]">{renderAnswers(version.submission)}</dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
