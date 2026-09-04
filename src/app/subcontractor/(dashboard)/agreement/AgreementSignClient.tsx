"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RenderedSubcontractorAgreementSection } from "@/lib/crm-subcontractor-agreement";
import type { SubcontractorProfileRow } from "@/lib/crm-subcontractor-types";

type ActionResult = { error?: string };

type Props = {
  profile: SubcontractorProfileRow;
  assignedClientName: string | null;
  compensationArrangement: string;
  version: number;
  sections: RenderedSubcontractorAgreementSection[];
  signAction: (formData: FormData) => Promise<ActionResult>;
};

export default function AgreementSignClient({ profile, assignedClientName, compensationArrangement, version, sections, signAction }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [typedName, setTypedName] = useState("");

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Independent Contractor Agreement</h1>
        <p className="mt-1 text-sm text-slate-500">Version {version.toFixed(1)} · Please read the full agreement before signing.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Business Name</dt>
            <dd className="font-medium text-slate-800">{profile.business_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Country</dt>
            <dd className="font-medium text-slate-800">{profile.country ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="font-medium text-slate-800">{profile.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Compensation</dt>
            <dd className="font-medium text-slate-800">{compensationArrangement}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Start Date</dt>
            <dd className="font-medium text-slate-800">{profile.start_date ?? "Not yet set"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Assigned Client</dt>
            <dd className="font-medium text-slate-800">{assignedClientName ?? "Not yet assigned"}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.key} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
            <h2 className="text-sm font-bold text-slate-900">{section.title}</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{section.body}</p>
          </div>
        ))}
      </div>

      <form action={submit} className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6">
        <h2 className="text-sm font-bold text-slate-900">Sign Agreement</h2>

        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span>I have read and understood this Independent Contractor Agreement in full and agree to its terms.</span>
          <input type="hidden" name="acknowledged" value={acknowledged ? "on" : ""} />
        </label>

        <div className="mt-4 max-w-sm">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Type your full legal name to sign
            <input
              name="contractor_name"
              required
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Full legal name"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        <button
          type="submit"
          disabled={isPending || !acknowledged || !typedName.trim()}
          className="mt-4 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Submitting…" : "Accept & Sign Agreement"}
        </button>
      </form>
    </div>
  );
}
