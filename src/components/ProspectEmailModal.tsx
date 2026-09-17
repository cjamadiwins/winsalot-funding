"use client";

import { useMemo, useState } from "react";
import { getDefaultProspectEmailTemplate } from "@/lib/prospect-email-templates";
import { OPPORTUNITY_TYPE_LABELS, type OpportunityType } from "@/lib/crm-types";
import { DETAILED_SERVICE_LABELS, formatLeadGenerationPrice, getDetailedServicePricingTemplate, type DetailedService, type ServicePricing } from "@/lib/detailed-service-pricing";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
export type SendProspectEmailResult = { error?: string; email?: string };
type EmailKind = "consultation" | "detailed_service_pricing";

export default function ProspectEmailModal({ businessName, contactName, toEmail, opportunityType, continueUrl, leadGenerationPricing, canUpdatePrice = false, onClose, onSend, onSendDetailed, onUpdatePrice, onSent }: {
  businessName: string; contactName: string | null; toEmail: string; opportunityType: OpportunityType; continueUrl: string;
  leadGenerationPricing: ServicePricing; canUpdatePrice?: boolean; onClose: () => void;
  onSend: (input: { subject: string; message: string; ctaText: string }) => Promise<SendProspectEmailResult>;
  onSendDetailed: (service: DetailedService) => Promise<SendProspectEmailResult>;
  onUpdatePrice?: (priceCents: number) => Promise<{ error?: string }>; onSent: () => void;
}) {
  const defaults = getDefaultProspectEmailTemplate(opportunityType, { businessName, contactName: contactName ?? "" });
  const [kind, setKind] = useState<EmailKind | null>(null);
  const [service, setService] = useState<DetailedService | null>(null);
  const [subject, setSubject] = useState(defaults.subject);
  const [message, setMessage] = useState(defaults.message);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDollars, setPriceDollars] = useState(String(leadGenerationPricing.priceCents / 100));
  const detailedPreview = useMemo(() => service ? getDetailedServicePricingTemplate({ service, contactName, businessName, leadGenerationPricing }) : null, [service, contactName, businessName, leadGenerationPricing]);

  async function handleSend() {
    if (submitting || sent || !kind) return;
    setSubmitting(true); setError(null);
    const result = kind === "detailed_service_pricing" ? (service ? await onSendDetailed(service) : { error: "Choose a service." }) : await onSend({ subject: subject.trim(), message: message.trim(), ctaText: defaults.ctaText });
    if (result.error) { setSubmitting(false); setError(result.error); return; }
    setSent(true); onSent();
  }

  async function savePrice() {
    if (!onUpdatePrice) return;
    const cents = Math.round(Number(priceDollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { setError("Enter a valid approved monthly price."); return; }
    setSubmitting(true); setError(null);
    const result = await onUpdatePrice(cents);
    setSubmitting(false);
    if (result.error) setError(result.error); else window.location.reload();
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
    <div role="dialog" aria-modal="true" aria-label="Send Email" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-[17px] font-bold text-slate-900">Send Email</h2>{kind && <p className="mt-0.5 text-xs text-slate-500">Send Email → {kind === "detailed_service_pricing" ? "Detailed Service & Pricing" : "Consultation Invitation"}</p>}</div><button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50">✕</button></div>
      <dl className="mt-3 grid grid-cols-1 gap-1.5 text-[12.5px] text-slate-500 sm:grid-cols-2"><div>Recipient: <span className="font-medium text-slate-700">{contactName || "—"} · {toEmail}</span></div><div>Business: <span className="font-medium text-slate-700">{businessName}</span></div></dl>

      {!kind ? <div className="mt-5 space-y-3">
        <p className="text-[13px] font-semibold text-slate-600">Select email type</p>
        <button type="button" onClick={() => setKind("consultation")} className="w-full rounded-xl border border-purple-200 bg-purple-50 p-4 text-left transition hover:border-purple-400"><span className="block font-semibold text-purple-900">Consultation Invitation</span><span className="mt-1 block text-sm text-purple-700">Use for an interested prospect when you want them to book a consultation.</span></button>
        <button type="button" onClick={() => setKind("detailed_service_pricing")} className="w-full rounded-xl border border-sky-200 bg-sky-50 p-4 text-left transition hover:border-sky-400"><span className="block font-semibold text-sky-900">Detailed Service & Pricing</span><span className="mt-1 block text-sm text-sky-700">For an interested prospect who specifically requested service and pricing information.</span></button>
      </div> : kind === "detailed_service_pricing" && !service ? <div className="mt-5 space-y-3">
        <p className="text-[13px] font-semibold text-slate-600">Select service</p>
        {(["lead_generation", "business_financing"] as DetailedService[]).map((value) => {
          const cardClass = value === "lead_generation"
            ? "border-blue-200 bg-blue-50 text-blue-600 hover:border-blue-300 hover:bg-blue-100 focus-visible:border-blue-300 focus-visible:bg-blue-100"
            : "border-green-200 bg-green-50 text-green-700 hover:border-green-300 hover:bg-green-100 focus-visible:border-green-300 focus-visible:bg-green-100";
          return (
            <button key={value} type="button" onClick={() => setService(value)} className={`w-full rounded-xl border p-4 text-left font-semibold transition ${cardClass}`}>
              {DETAILED_SERVICE_LABELS[value]}
              {value === "lead_generation" && <span className="ml-2 text-sm font-medium text-blue-600">Approved price: {formatLeadGenerationPrice(leadGenerationPricing)}</span>}
            </button>
          );
        })}
        <button type="button" onClick={() => setKind(null)} className="text-sm font-semibold text-slate-500">← Back</button>
      </div> : <div className="mt-4 space-y-3">
        {kind === "consultation" ? <><div className="text-xs font-medium text-slate-500">Service type: {OPPORTUNITY_TYPE_LABELS[opportunityType]}</div><label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-slate-600">Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sent} className={inputClass} /></label><label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-slate-600">Message</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={sent} className={`${inputClass} min-h-[260px] resize-y font-mono text-[13px]`} /></label></> : detailedPreview && service ? <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-3"><div><span className="text-xs font-semibold uppercase tracking-wide text-sky-700">Selected service</span><p className="font-semibold text-sky-950">{DETAILED_SERVICE_LABELS[service]}</p></div>{service === "lead_generation" && <div className="text-right"><span className="text-xs font-semibold uppercase tracking-wide text-sky-700">Approved price</span><p className="font-bold text-sky-950">{formatLeadGenerationPrice(leadGenerationPricing)}</p></div>}</div>
          {service === "lead_generation" && canUpdatePrice && onUpdatePrice && <div className="rounded-lg border border-slate-200 p-3 text-sm">{!editingPrice ? <button type="button" onClick={() => setEditingPrice(true)} className="font-semibold text-sky-700">Update approved price (Admin)</button> : <div className="flex flex-wrap items-end gap-2"><label className="flex-1"><span className="mb-1 block text-xs font-semibold text-slate-600">Monthly price (CAD)</span><input type="number" min="1" step="0.01" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} className={inputClass} /></label><button type="button" onClick={savePrice} disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white">Save</button></div>}</div>}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Email preview</p><p className="font-semibold text-slate-900">Subject: {detailedPreview.subject}</p><div className="mt-3 max-h-[360px] overflow-y-auto rounded-lg border border-[#D9E6F2] bg-white text-sm leading-6 text-[#374151]"><div className="border-b border-[#D9E6F2] bg-[#F5F9FF] px-4 py-3"><div className="text-base font-bold text-[#1E3A5F]">Winsalot Corp.</div><div className="mt-0.5 text-xs text-[#52677D]">Empowering Businesses, One Solution at a Time.</div></div><div className="space-y-3 p-4">{detailedPreview.paragraphs.map((paragraph, index) => <div key={index}><p className="whitespace-pre-line">{paragraph}</p>{paragraph === "What Our Lead Generation Service Includes" && <ul className="mt-2 list-disc pl-5">{detailedPreview.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}</div>)}<div className="pt-1 text-center"><a href={continueUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-blue-600 px-5 py-3 font-bold text-white">Continue with Winsalot Corp.</a></div></div></div></div>
        </> : null}
        {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}{sent && !error && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-700">Email sent to {toEmail}.</p>}
        {kind === "detailed_service_pricing" && detailedPreview && service && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-5 text-amber-950"><strong>Before sending:</strong> {service === "lead_generation" ? <>Confirm the prospect has requested service/pricing information, verify the correct service is selected, and review the email preview. The standard Lead Generation price is <strong>$750/month</strong>. Do not offer or mention a pilot program unless approved by Admin.</> : <>Confirm the prospect has requested business financing information, verify the correct service is selected, and review the email preview. Do not quote or guarantee funding amounts, rates, repayment terms, or approval. Financing terms are determined by the lender based on the business profile and approval.</>}</p>}
        <div className="flex flex-wrap gap-3 pt-1"><button type="button" disabled={submitting || sent || (kind === "consultation" && (!subject.trim() || !message.trim()))} onClick={handleSend} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Sending…" : sent ? "Sent" : "Send Email"}</button>{!sent && <button type="button" disabled={submitting} onClick={() => kind === "detailed_service_pricing" ? setService(null) : setKind(null)} className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700">← Back</button>}<button type="button" disabled={submitting} onClick={onClose} className="text-[13.5px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">{sent ? "Close" : "Cancel"}</button></div>
      </div>}
    </div>
  </div>;
}
