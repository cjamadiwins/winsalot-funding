"use client";

import { useState } from "react";
import { acceptAgreementAction } from "./actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

// Item 5: typed electronic signature + acceptance checkbox, collecting
// full legal name, job title, business name, and the signature itself -
// date/time and agreement version are recorded server-side
// (acceptAgreementAction / crm_client_agreements.accepted_at) rather
// than trusted from the client.
export default function AgreementSignClient({ token, agreementVersion }: { token: string; agreementVersion: number }) {
  const [fullLegalName, setFullLegalName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signatureText, setSignatureText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);

  async function handleSubmit() {
    if (submitting || signed) return;
    setSubmitting(true);
    setError(null);
    const result = await acceptAgreementAction({ token, fullLegalName, jobTitle, businessName, accepted, signatureText });
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setSigned(true);
  }

  if (signed) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h3 className="text-lg font-bold text-emerald-800">Agreement signed</h3>
        <p className="mt-2 text-sm text-emerald-700">A copy of the signed agreement has been emailed to you. Thank you.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Sign this Agreement</h3>
      <p className="mt-1 text-sm text-slate-500">Agreement version {agreementVersion}</p>

      <div className="mt-4 space-y-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Full Legal Name</span>
          <input value={fullLegalName} onChange={(e) => setFullLegalName(e.target.value)} disabled={submitting} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Job Title</span>
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} disabled={submitting} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Business Name</span>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={submitting} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-slate-600">Typed Signature</span>
          <input
            value={signatureText}
            onChange={(e) => setSignatureText(e.target.value)}
            disabled={submitting}
            placeholder="Type your full name as your signature"
            className={`${inputClass} font-serif italic`}
            style={{ fontSize: "18px" }}
          />
        </label>
        <label className="flex items-start gap-2 text-[13.5px] text-slate-700">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={submitting} className="mt-0.5" />
          <span>I have read and agree to the terms of this Client Service Agreement.</span>
        </label>

        {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}

        <button
          type="button"
          disabled={submitting || !fullLegalName.trim() || !jobTitle.trim() || !businessName.trim() || !accepted || !signatureText.trim()}
          onClick={handleSubmit}
          className="w-full rounded-full bg-sky-600 py-3 text-[15px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Signing…" : "Sign Agreement"}
        </button>
      </div>
    </div>
  );
}
