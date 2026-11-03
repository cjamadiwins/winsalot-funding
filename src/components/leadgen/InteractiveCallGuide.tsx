"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { EMPTY_ANSWERS, type QualificationAnswers } from "@/lib/leadgen-qualification";
import { NOT_QUALIFIED_LEAD_GEN_LABEL, callGuideToText, clientOffersEcommerce, guideServiceOptions, renderGuideLine, type CallGuide } from "@/lib/leadgen-call-guide";

type Props = {
  guide: CallGuide;
  agentName: string;
  // Services this client has Admin-approved. Drives the e-commerce question
  // and the "interested in" choices; nothing is assumed from the script.
  approvedServices: string[];
  // Controlled mode (lead page): answers live in the qualification form so
  // there is one source of truth. Omit for a preview (dashboard card).
  value?: QualificationAnswers;
  onChange?: (patch: Partial<QualificationAnswers>) => void;
  // Lead page only: lets the agent record "Not Qualified — Lead Generation Only".
  onMarkNotQualified?: () => void;
  pending?: boolean;
  compact?: boolean;
};

function Say({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-[14px] leading-6 text-slate-900">&ldquo;{children}&rdquo;</p>;
}

function Pills<T extends string>({ label, value, options, onPick }: { label: string; value: T | null; options: { value: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-slate-800">{label}</p>
      <div role="group" aria-label={label} className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={`min-h-9 rounded-full border px-3 py-1 text-[13px] font-medium transition ${value === o.value ? "border-sky-600 bg-sky-100 text-sky-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const YES_NO_UNSURE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
] as const;

// Interactive call guide for Hidebrandt / Teknokraft: opening, then the
// website question, then the matching branch, the consultation ask and the
// lead-generation-only handling. Answers recorded here are the same fields as
// the qualification form below it. It never books anything: a qualified
// prospect still goes to Admin review before anything reaches the client.
export default function InteractiveCallGuide({ guide, agentName, approvedServices, value, onChange, onMarkNotQualified, pending = false, compact = false }: Props) {
  const [local, setLocal] = useState<QualificationAnswers>(EMPTY_ANSWERS);
  const [copied, setCopied] = useState(false);
  const [leadGenAsked, setLeadGenAsked] = useState(false);
  const controlled = value !== undefined && onChange !== undefined;
  const answers = controlled ? value : local;
  const patch = (p: Partial<QualificationAnswers>) => (controlled ? onChange(p) : setLocal((prev) => ({ ...prev, ...p })));

  const offersEcommerce = clientOffersEcommerce(approvedServices);
  const services = useMemo(() => guideServiceOptions(approvedServices), [approvedServices]);
  const text = useMemo(() => callGuideToText(guide, agentName, { offersEcommerce }), [guide, agentName, offersEcommerce]);
  const hasSite = answers.has_website;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable; reading the script is never blocked.
    }
  }

  const toggleService = (key: string) =>
    patch({ services_of_interest: answers.services_of_interest.includes(key) ? answers.services_of_interest.filter((s) => s !== key) : [...answers.services_of_interest, key] });

  const branch = hasSite === "yes" ? guide.hasWebsite : hasSite === "no" ? guide.noWebsite : null;

  return (
    <div data-testid="interactive-call-guide" data-client={guide.clientKey} className={`rounded-xl border border-sky-200 bg-sky-50/60 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-700">Call guide · {guide.clientName}</h3>
        <button type="button" onClick={copy} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50">
          <Copy className="h-3 w-3" strokeWidth={2.5} />
          {copied ? "Copied!" : "Copy Script"}
        </button>
      </div>

      <div className="mt-3 space-y-3 text-sm text-slate-800">
        <section aria-label="Opening">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Opening</p>
          <div className="mt-1 space-y-1.5">
            {guide.opening.map((line) => (
              <Say key={line}>{renderGuideLine(line, agentName)}</Say>
            ))}
          </div>
        </section>

        <section aria-label="Website question" className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. Does the prospect have a website?</p>
          <Pills label="Prospect's answer" value={hasSite} options={[...YES_NO_UNSURE]} onPick={(v) =>
              patch({
                has_website: v,
                ...(v === "no" ? { satisfied_with_site: "not_applicable" as const, website_url: null } : {}),
                ...(v !== "no" && answers.satisfied_with_site === "not_applicable" ? { satisfied_with_site: null } : {}),
              })
            }
          />
          {hasSite === "unsure" && <p className="text-[12.5px] text-slate-600">Ask where customers find them online, or for the website address, then choose Yes or No.</p>}
        </section>

        {branch && (
          <section aria-label={hasSite === "yes" ? "Has a website" : "No website"} className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{hasSite === "yes" ? "3. Prospect has a website" : "3. Prospect has no website"}</p>
            <Say>{branch.say}</Say>
            {hasSite === "yes" && (
              <input
                type="text"
                value={answers.website_url ?? ""}
                onChange={(e) => patch({ website_url: e.target.value })}
                placeholder="Website address"
                aria-label="Website address"
                className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            )}
            <Pills
              label={hasSite === "yes" ? "Interested in a redesign or upgrade?" : "Interested in a new website?"}
              value={answers.interested_in_new_or_redesign}
              options={
                hasSite === "yes"
                  ? [
                      { value: "redesign", label: "Redesign" },
                      { value: "both", label: "Either" },
                      { value: "neither", label: "Neither" },
                      { value: "unsure", label: "Not sure" },
                    ]
                  : [
                      { value: "new_website", label: "New website" },
                      { value: "neither", label: "No" },
                      { value: "unsure", label: "Not sure" },
                    ]
              }
              onPick={(v) => patch({ interested_in_new_or_redesign: v })}
            />
            {hasSite === "yes" && (
              <Pills
                label="Satisfied with design and performance?"
                value={answers.satisfied_with_site}
                options={[
                  { value: "satisfied", label: "Satisfied" },
                  { value: "not_satisfied", label: "Not satisfied" },
                  { value: "unsure", label: "Not sure" },
                ]}
                onPick={(v) => patch({ satisfied_with_site: v })}
              />
            )}
            <Pills label={hasSite === "yes" ? "Interested in SEO or better search visibility?" : "Interested in establishing an online presence / search visibility?"} value={answers.interested_in_seo} options={[...YES_NO_UNSURE]} onPick={(v) => patch({ interested_in_seo: v })} />
            {offersEcommerce ? (
              <Pills label="Needs e-commerce functionality?" value={answers.needs_ecommerce} options={[...YES_NO_UNSURE]} onPick={(v) => patch({ needs_ecommerce: v })} />
            ) : (
              <p className="text-[12px] text-slate-500">{guide.shortName} has not confirmed e-commerce, so do not pitch it. If the prospect raises it, record their answer in the qualification form below.</p>
            )}
          </section>
        )}

        {branch && (
          <section aria-label="Interested services" className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">4. What does the prospect want to discuss?</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Services the prospect is interested in">
              {services.length === 0 ? (
                <p className="text-[12.5px] text-slate-500">Open the lead to choose from the services {guide.shortName} offers.</p>
              ) : (
                services.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={answers.services_of_interest.includes(s.key)}
                    onClick={() => toggleService(s.key)}
                    className={`min-h-9 rounded-full border px-3 py-1 text-[13px] font-medium ${answers.services_of_interest.includes(s.key) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    {s.label}
                  </button>
                ))
              )}
            </div>
            <label className="block text-[13px] font-semibold text-slate-800">
              Specific website-related need (in the prospect&apos;s own words)
              <textarea value={answers.challenges ?? ""} onChange={(e) => patch({ challenges: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="block text-[13px] font-semibold text-slate-800">
              Prospect requirements
              <textarea value={answers.intended_improvements ?? ""} onChange={(e) => patch({ intended_improvements: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="block text-[13px] font-semibold text-slate-800">
              Call notes
              <textarea value={answers.qualification_notes ?? ""} onChange={(e) => patch({ qualification_notes: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
          </section>
        )}

        {branch && (
          <section aria-label="Consultation" className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">5. If the prospect expresses interest</p>
            <Say>{guide.ifInterested}</Say>
            <Pills label="Prospect understands the service?" value={answers.understands_services === null ? null : answers.understands_services ? "yes" : "no"} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onPick={(v) => patch({ understands_services: v === "yes" })} />
            <Pills label="Prospect agreed to discuss it with the client?" value={answers.agreed_to_appointment === null ? null : answers.agreed_to_appointment ? "yes" : "no"} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onPick={(v) => patch({ agreed_to_appointment: v === "yes" })} />
            <p className="text-[12px] text-slate-600">Not every answer has to be &ldquo;yes&rdquo;. Record what applies and confirm genuine interest in at least one approved service. An appointment still goes to Admin for approval before anything is sent to {guide.shortName}.</p>
          </section>
        )}

        <section aria-label="Lead generation only" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">If the prospect only wants leads or customers</p>
          {!leadGenAsked && !answers.lead_gen_only ? (
            <button type="button" onClick={() => setLeadGenAsked(true)} className="min-h-9 rounded-full border border-amber-400 bg-white px-3 py-1 text-[13px] font-semibold text-amber-900 hover:bg-amber-100">
              Prospect says they only want leads / customers
            </button>
          ) : (
            <>
              <Say>{guide.leadGenOnlyPrompt}</Say>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={!answers.lead_gen_only && leadGenAsked}
                  onClick={() => {
                    patch({ lead_gen_only: false });
                    setLeadGenAsked(true);
                  }}
                  className="min-h-9 rounded-full border border-emerald-500 bg-white px-3 py-1 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  Yes, also interested in website / visibility
                </button>
                <button
                  type="button"
                  aria-pressed={answers.lead_gen_only}
                  onClick={() => patch({ lead_gen_only: true, agreed_to_appointment: false })}
                  className="min-h-9 rounded-full border border-red-400 bg-white px-3 py-1 text-[13px] font-semibold text-red-800 hover:bg-red-50"
                >
                  No, leads only
                </button>
              </div>
              {answers.lead_gen_only && (
                <div role="status" className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[13px] text-red-900">
                  <p className="font-semibold">{NOT_QUALIFIED_LEAD_GEN_LABEL}</p>
                  <p className="mt-0.5">Do not offer a {guide.shortName} appointment. A lead-generation-only prospect cannot be booked or approved.</p>
                  {onMarkNotQualified ? (
                    <button type="button" disabled={pending} onClick={onMarkNotQualified} className="mt-2 min-h-9 rounded-full bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                      Save as {NOT_QUALIFIED_LEAD_GEN_LABEL}
                    </button>
                  ) : (
                    <p className="mt-1 text-[12px] text-red-800">Open the lead to record this.</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {!controlled && <p className="text-[12px] text-slate-500">Preview only. Open a lead to record the prospect&apos;s answers; they are saved on that lead for Admin review.</p>}
      </div>
    </div>
  );
}
