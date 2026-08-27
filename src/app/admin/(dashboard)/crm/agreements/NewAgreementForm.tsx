"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startOnboardingFromOpportunityAction, createAgreementForClientAction } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

type Option = { id: string; label: string };

// Item 2: "Allow the admin to start the onboarding workflow from an
// existing Growth CRM opportunity. If no client record exists, allow the
// admin to create a new client during the process." All three paths
// (from an opportunity, from an existing client, or a brand-new client)
// funnel into the same duplicate-email-checked resolveOrCreateClient
// logic server-side (see actions.ts).
export default function NewAgreementForm({ opportunities, clients }: { opportunities: Option[]; clients: Option[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"opportunity" | "existing" | "new">("opportunity");
  const [opportunityId, setOpportunityId] = useState("");
  const [existingClientId, setExistingClientId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "opportunity"
          ? await startOnboardingFromOpportunityAction(opportunityId)
          : mode === "existing"
            ? await createAgreementForClientAction({ existingClientId })
            : await createAgreementForClientAction({ newClient: { companyName, contactName, email } });

      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/admin/crm/agreements/${result.agreementId}`);
    });
  }

  return (
    <div className="mt-3">
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "opportunity"} onChange={() => setMode("opportunity")} /> From Opportunity
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing Client
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New Client
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {mode === "opportunity" && (
          <select value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} className={inputClass}>
            <option value="">Select an opportunity…</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {mode === "existing" && (
          <select value={existingClientId} onChange={(e) => setExistingClientId(e.target.value)} className={inputClass}>
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}

        {mode === "new" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input placeholder="Legal business name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />
            <input placeholder="Contact person" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
            <input placeholder="Business email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
        )}

        {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

        <button
          type="button"
          disabled={
            isPending ||
            (mode === "opportunity" && !opportunityId) ||
            (mode === "existing" && !existingClientId) ||
            (mode === "new" && (!companyName.trim() || !email.trim()))
          }
          onClick={handleSubmit}
          className={buttonClasses}
        >
          {isPending ? "Creating…" : "Create Draft Agreement"}
        </button>
      </div>
    </div>
  );
}
