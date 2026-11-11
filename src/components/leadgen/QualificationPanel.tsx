"use client";

import { useMemo, useState, useTransition } from "react";
import {
  EMPTY_ANSWERS,
  QC_STATUS_LABELS,
  QC_STATUS_STYLES,
  QUALIFICATION_CATEGORY_LABELS,
  QUALIFICATION_OUTCOME_LABELS,
  classifyFromAnswers,
  evaluateQualifiable,
  serviceLabel,
  suggestOutcome,
  type QcStatus,
  type QualificationAnswers,
  type QualificationCategory,
  type QualificationOutcome,
} from "@/lib/leadgen-qualification";
import { resubmitAppointmentForApprovalAction, saveQualificationAction } from "@/app/leadgen/qualification-actions";
import { getCallGuide } from "@/lib/leadgen-call-guide";
import InteractiveCallGuide from "./InteractiveCallGuide";

type PanelAppointment = { id: string; appointment_date: string; appointment_time: string; qc_status: string; qc_admin_feedback: string | null; qc_rejection_reason: string | null };

type Props = {
  leadId: string;
  clientName: string;
  approvedServices: string[];
  initial: (QualificationAnswers & { outcome: QualificationOutcome; category: QualificationCategory | null; category_source: "auto_preliminary" | "agent_verified" }) | null;
  preliminaryCategory: QualificationCategory;
  appointments: PanelAppointment[];
  // Logged-in user's name, used to fill [Agent Name] in the call guide.
  agentName?: string;
};

function Choice<T extends string>({ name, value, options, onChange }: { name: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="mt-1.5 flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${value === option.value ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
        >
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
          {option.label}
        </label>
      ))}
    </div>
  );
}

const YES_NO_UNSURE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
] as const;

// Lead-page card: the eight mandatory qualification questions, the services
// this client actually offers, the filtering category (preliminary until the
// agent submits), and the approval status of any appointment for this lead.
// The database enforces the same rules - this only gives earlier feedback.
export default function QualificationPanel({ leadId, clientName, approvedServices, initial, preliminaryCategory, appointments, agentName = "" }: Props) {
  const callGuide = getCallGuide(clientName);
  const [answers, setAnswers] = useState<QualificationAnswers>(() => (initial ? { ...EMPTY_ANSWERS, ...initial } : EMPTY_ANSWERS));
  const [outcome, setOutcome] = useState<QualificationOutcome>(initial?.outcome ?? "draft");
  const [savedCategory, setSavedCategory] = useState<{ label: string; verified: boolean } | null>(
    initial?.category ? { label: QUALIFICATION_CATEGORY_LABELS[initial.category], verified: initial.category_source === "agent_verified" } : null
  );
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof QualificationAnswers>(key: K, value: QualificationAnswers[K]) => setAnswers((prev) => ({ ...prev, [key]: value }));
  const check = useMemo(() => evaluateQualifiable(answers, approvedServices), [answers, approvedServices]);
  const liveCategory = useMemo(() => classifyFromAnswers(answers, approvedServices), [answers, approvedServices]);
  const suggested = useMemo(() => suggestOutcome(answers, approvedServices), [answers, approvedServices]);

  const toggleService = (key: string) => set("services_of_interest", answers.services_of_interest.includes(key) ? answers.services_of_interest.filter((s) => s !== key) : [...answers.services_of_interest, key]);

  const save = (next: QualificationOutcome) => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveQualificationAction({ leadId, answers, outcome: next });
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setOutcome(result.outcome ?? next);
      if (result.categoryLabel) setSavedCategory({ label: result.categoryLabel, verified: (result.outcome ?? next) !== "draft" });
      setMessage({ kind: "ok", text: result.message ?? "Saved." });
    });
  };

  const resubmit = (appointmentId: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await resubmitAppointmentForApprovalAction(appointmentId);
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "ok", text: result.message ?? "Resubmitted." });
    });
  };

  const categoryShown = savedCategory ?? { label: QUALIFICATION_CATEGORY_LABELS[preliminaryCategory], verified: false };

  return (
    <section aria-label="Qualification" className="mb-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Qualify for {clientName}</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Complete these before booking. An appointment is only accepted when the prospect confirmed interest in a service {clientName} offers, understands it, and agreed to the appointment.
          </p>
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">{categoryShown.label}</span>
          <p className="mt-0.5 text-[11px] text-slate-500">{categoryShown.verified ? "Verified by agent" : "Preliminary - not yet verified"}</p>
        </div>
      </div>

      {appointments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {appointments.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">
                  Appointment {a.appointment_date} {a.appointment_time.slice(0, 5)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${QC_STATUS_STYLES[a.qc_status as QcStatus] ?? QC_STATUS_STYLES.not_required}`}>{QC_STATUS_LABELS[a.qc_status as QcStatus] ?? a.qc_status}</span>
                {a.qc_status === "needs_info" && (
                  <button type="button" disabled={pending || outcome !== "qualified"} onClick={() => resubmit(a.id)} className="rounded-full bg-sky-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
                    Resubmit for approval
                  </button>
                )}
              </div>
              {a.qc_rejection_reason && <p className="mt-1 text-[12.5px] text-red-800">Rejected: {a.qc_rejection_reason}</p>}
              {a.qc_admin_feedback && <p className="mt-1 text-[12.5px] text-slate-700">Admin feedback: {a.qc_admin_feedback}</p>}
              {a.qc_status === "needs_info" && outcome !== "qualified" && <p className="mt-1 text-[12px] text-slate-500">Update the answers below and mark the lead Qualified, then resubmit.</p>}
            </li>
          ))}
        </ul>
      )}

      {callGuide && (
        <div className="mt-4">
          <InteractiveCallGuide
            guide={callGuide}
            agentName={agentName}
            approvedServices={approvedServices}
            value={answers}
            onChange={(patch) => setAnswers((prev) => ({ ...prev, ...patch }))}
            onMarkNotQualified={() => save("not_qualified")}
            pending={pending}
            compact
          />
          <p className="mt-1.5 text-[11.5px] text-slate-500">Answers in the guide fill the same questions below. Nothing is saved until you use a save button.</p>
        </div>
      )}

      <div className="mt-4 grid gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">1. Does the business currently have a website?</p>
          <Choice name="has_website" value={answers.has_website} options={[...YES_NO_UNSURE]} onChange={(v) => set("has_website", v)} />
          {answers.has_website === "yes" && (
            <input
              type="text"
              value={answers.website_url ?? ""}
              onChange={(e) => set("website_url", e.target.value)}
              placeholder="Website address"
              className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">2. Is the prospect interested in a new website or a redesign?</p>
          <Choice
            name="interest"
            value={answers.interested_in_new_or_redesign}
            options={[
              { value: "new_website", label: "New website" },
              { value: "redesign", label: "Redesign" },
              { value: "both", label: "Either" },
              { value: "neither", label: "Neither" },
              { value: "unsure", label: "Not sure" },
            ]}
            onChange={(v) => set("interested_in_new_or_redesign", v)}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">3. Is the prospect satisfied with the current website?</p>
          <Choice
            name="satisfied"
            value={answers.satisfied_with_site}
            options={[
              { value: "satisfied", label: "Satisfied" },
              { value: "not_satisfied", label: "Not satisfied" },
              { value: "unsure", label: "Not sure" },
              { value: "not_applicable", label: "No website" },
            ]}
            onChange={(v) => set("satisfied_with_site", v)}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">4. Does the business require e-commerce functionality?</p>
          <Choice name="ecom" value={answers.needs_ecommerce} options={[...YES_NO_UNSURE]} onChange={(v) => set("needs_ecommerce", v)} />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">5. Is the prospect interested in improving search visibility or SEO?</p>
          <Choice name="seo" value={answers.interested_in_seo} options={[...YES_NO_UNSURE]} onChange={(v) => set("interested_in_seo", v)} />
        </div>

        <div>
          <label htmlFor={`challenges-${leadId}`} className="text-sm font-semibold text-slate-800">
            6. What specific website-related challenges does the business face?
          </label>
          <textarea
            id={`challenges-${leadId}`}
            value={answers.challenges ?? ""}
            onChange={(e) => set("challenges", e.target.value)}
            rows={3}
            placeholder="In the prospect's own words. Leave out anything they did not say."
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">7. Does the prospect understand the services being offered?</p>
          <Choice
            name="understands"
            value={answers.understands_services === null ? null : answers.understands_services ? "yes" : "no"}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onChange={(v) => set("understands_services", v === "yes")}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">8. Has the prospect agreed to an appointment to discuss those services?</p>
          <Choice
            name="agreed"
            value={answers.agreed_to_appointment === null ? null : answers.agreed_to_appointment ? "yes" : "no"}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onChange={(v) => set("agreed_to_appointment", v === "yes")}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">9. Is the person the owner or the decision-maker who accepted the appointment?</p>
          <Choice name="decision_maker" value={answers.decision_maker} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No, someone else" }, { value: "unsure", label: "Not sure" }]} onChange={(v) => set("decision_maker", v)} />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">10. Did you verify the contact&apos;s name, phone number and email address?</p>
          <Choice
            name="contact_verified"
            value={answers.contact_verified === null ? null : answers.contact_verified ? "yes" : "no"}
            options={[{ value: "yes", label: "Verified" }, { value: "no", label: "Not yet" }]}
            onChange={(v) => set("contact_verified", v === "yes")}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">11. Did you confirm the appointment date and time with the prospect?</p>
          <Choice
            name="appointment_confirmed"
            value={answers.appointment_confirmed === null ? null : answers.appointment_confirmed ? "yes" : "no"}
            options={[{ value: "yes", label: "Confirmed" }, { value: "no", label: "Not yet" }]}
            onChange={(v) => set("appointment_confirmed", v === "yes")}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800">Services the prospect is interested in ({clientName} offers these)</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {approvedServices.map((key) => (
              <label key={key} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-medium ${answers.services_of_interest.includes(key) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={answers.services_of_interest.includes(key)} onChange={() => toggleService(key)} className="sr-only" />
                {serviceLabel(key)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor={`improve-${leadId}`} className="text-sm font-semibold text-slate-800">
            What does the prospect want to improve? (optional)
          </label>
          <textarea id={`improve-${leadId}`} value={answers.intended_improvements ?? ""} onChange={(e) => set("intended_improvements", e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </div>

        <div>
          <label htmlFor={`notes-${leadId}`} className="text-sm font-semibold text-slate-800">
            Qualification notes (optional)
          </label>
          <textarea id={`notes-${leadId}`} value={answers.qualification_notes ?? ""} onChange={(e) => set("qualification_notes", e.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <input type="checkbox" checked={answers.lead_gen_only} onChange={(e) => set("lead_gen_only", e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-semibold">The prospect only wants lead generation or cold calling</span> and has no interest in the website services {clientName} offers. This cannot be booked as an appointment.
          </span>
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-700">
        <p>
          <span className="font-semibold">Category from these answers:</span> {QUALIFICATION_CATEGORY_LABELS[liveCategory]} <span className="text-slate-500">(preliminary until you save)</span>
        </p>
        <p className="mt-0.5">
          <span className="font-semibold">Saved status:</span> {QUALIFICATION_OUTCOME_LABELS[outcome]}
          {suggested !== outcome && outcome !== "draft" ? <span className="text-slate-500"> · answers now suggest: {QUALIFICATION_OUTCOME_LABELS[suggested]}</span> : null}
        </p>
        {!check.ok && (
          <ul className="mt-1 list-disc pl-5 text-slate-600">
            {check.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>

      {message && (
        <p role="status" className={`mt-3 rounded-lg px-3.5 py-2 text-sm ${message.kind === "ok" ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={pending || !check.ok} onClick={() => save("qualified")} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
          Save as Qualified
        </button>
        <button type="button" disabled={pending} onClick={() => save("requires_further_qualification")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Needs follow-up
        </button>
        <button type="button" disabled={pending} onClick={() => save("not_qualified")} className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
          Not qualified
        </button>
        <button type="button" disabled={pending} onClick={() => save("draft")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          Save draft
        </button>
      </div>
    </section>
  );
}
