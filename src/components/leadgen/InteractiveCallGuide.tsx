"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { EMPTY_ANSWERS, evaluateQualifiable, type QualificationAnswers } from "@/lib/leadgen-qualification";
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
  // Lead page only: result of saving the Google answer as it is clicked.
  googleSave?: { state: "idle" | "saving" | "saved" | "error"; text?: string };
  // Lead page only: the BOOK APPOINTMENT button opens the CRM's existing
  // booking form. Nothing is booked by clicking it.
  onBookAppointment?: (opts: { timePreference: "morning" | "afternoon" | null }) => void;
  bookingOpen?: boolean;
  // The booking form, rendered under the "Confirm the appointment" step.
  bookingSlot?: React.ReactNode;
  // Lead page only: record the call outcome / schedule a follow-up with the
  // CRM's existing actions. Each resolves to an error message, or null.
  onRecordOutcome?: (outcome: "Not interested" | "Do not call") => Promise<string | null>;
  onScheduleFollowUp?: (scheduledAtLocal: string, note: string) => Promise<string | null>;
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
            className={`min-h-10 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${value === o.value ? "border-sky-600 bg-sky-100 text-sky-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
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


function StepHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">
        {n}
      </span>
      <span>{children}</span>
    </p>
  );
}

function AgentNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] leading-5 text-amber-900">
      <span className="font-semibold">Agent note, do not read aloud: </span>
      {children}
    </p>
  );
}

// Interactive call guide for Hidebrandt / Teknokraft: opening, then the
// website question, then the matching branch, the consultation ask and the
// lead-generation-only handling. Answers recorded here are the same fields as
// the qualification form below it. It never books anything: a qualified
// prospect still goes to Admin review before anything reaches the client.
export default function InteractiveCallGuide({ guide, agentName, approvedServices, value, onChange, onMarkNotQualified, pending = false, googleSave, onBookAppointment, bookingOpen = false, bookingSlot, onRecordOutcome, onScheduleFollowUp, compact = false }: Props) {
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
  const yesNo = (v: boolean | null) => (v === null ? null : v ? "yes" : "no");

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

  const g = guide.google;
  const gi = answers.google_interest;
  // "No" + satisfied: the call ends politely; nothing further is offered.
  const callEnds = gi === "no" && answers.online_customers_satisfied === "satisfied";
  // Leads saved before the Google step existed already have website answers.
  const remaining = !callEnds && (gi !== null || hasSite !== null);
  const branch = remaining ? (hasSite === "yes" ? guide.hasWebsite : hasSite === "no" ? guide.noWebsite : null) : null;
  const interested = gi === "yes" || gi === "more";
  const [timePref, setTimePref] = useState<"morning" | "afternoon" | "other" | null>(null);
  const [notReadyOpen, setNotReadyOpen] = useState(false);
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [actionStatus, setActionStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | null>, okText: string) => {
    setBusy(true);
    setActionStatus(null);
    try {
      const error = await fn();
      setActionStatus(error ? { kind: "error", text: error } : { kind: "ok", text: okText });
    } catch {
      setActionStatus({ kind: "error", text: "Could not save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };
  const specialistPills = <Pills label={g.specialist.label} value={answers.specialist_interest} options={g.specialist.options} onPick={(v) => patch({ specialist_interest: v })} />;
  const approved = new Set(approvedServices);
  const interestedInOffered = answers.services_of_interest.some((k) => approved.has(k));
  const check = evaluateQualifiable(answers, approvedServices);
  const checklist = [
    { done: interestedInOffered && answers.understands_services === true, text: `Genuine interest in at least one service ${guide.shortName} offers` },
    { done: Boolean(answers.challenges?.trim()), text: "A relevant business need or growth objective" },
    { done: answers.decision_maker === "yes", text: "Appointment accepted by the owner or appropriate decision-maker" },
    { done: answers.contact_verified === true, text: "Contact information verified (done in the booking form)" },
    { done: answers.appointment_confirmed === true, text: "Appointment date and time confirmed (done in the booking form)" },
  ];

  const bookButton = (
    <div className="space-y-1">
      <button
        type="button"
        data-testid="book-appointment"
        disabled={!onBookAppointment}
        onClick={() => onBookAppointment?.({ timePreference: timePref === "morning" || timePref === "afternoon" ? timePref : null })}
        className="min-h-12 w-full rounded-full bg-emerald-600 px-6 py-3 text-base font-extrabold uppercase tracking-wide text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
      >
        {bookingOpen ? "Booking form open ↓" : "Book appointment"}
      </button>
      <p className="text-[12px] text-slate-600">{onBookAppointment ? "Opens the booking form for this lead. Nothing is booked until you save it." : "Open a lead to book an appointment."}</p>
    </div>
  );

  const notReady = (
    <div className="space-y-1.5">
      <button
        type="button"
        data-testid="not-ready"
        onClick={() => {
          setNotReadyOpen((v) => !v);
          if (answers.specialist_interest !== "follow_up") patch({ specialist_interest: "follow_up" });
        }}
        aria-expanded={notReadyOpen}
        className="min-h-10 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        Not ready to book
      </button>
      {notReadyOpen && (
        <div data-testid="not-ready-panel" className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
          <Say>{g.notReady.say}</Say>
          <AgentNote>{g.notReady.note}</AgentNote>
          {onScheduleFollowUp ? (
            <div className="flex flex-wrap items-center gap-2">
              <input type="datetime-local" aria-label="Follow-up date and time" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              <input aria-label="Follow-up note" placeholder="Note (optional)" value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              <button
                type="button"
                disabled={busy || !followUpAt}
                onClick={() => run(() => onScheduleFollowUp(followUpAt, followUpNote), "Follow-up scheduled. No appointment was created.")}
                className="min-h-10 rounded-full bg-sky-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                Schedule follow-up
              </button>
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">Open the lead to schedule the follow-up.</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div data-testid="interactive-call-guide" data-client={guide.clientKey} className={`rounded-xl border border-sky-200 bg-sky-50/60 ${compact ? "p-3" : "p-3 sm:p-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-700">Call guide · {guide.clientName}</h3>
        <div className="flex items-center gap-2">
          <a href={`#objections-${guide.clientKey}`} className="inline-flex min-h-10 items-center rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-50">
            Objections
          </a>
          <button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50">
            <Copy className="h-3 w-3" strokeWidth={2.5} />
            {copied ? "Copied!" : "Copy Script"}
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3 text-sm text-slate-800">
        <section aria-label="Opening">
          <StepHeading n={1}>Professional introduction</StepHeading>
          <div className="mt-1 space-y-1.5">
            {guide.opening.map((line) => (
              <Say key={line}>{renderGuideLine(line, agentName)}</Say>
            ))}
          </div>
        </section>

        <section aria-label="Google visibility question" className="space-y-2">
          <StepHeading n={2}>Google visibility question</StepHeading>
          <Say>{g.question}</Say>
          <Pills label="Prospect's answer" value={gi} options={g.options} onPick={(v) => patch({ google_interest: v })} />
          {googleSave && googleSave.state !== "idle" && (
            <p
              role="status"
              data-testid="google-save-status"
              className={`text-[12px] ${googleSave.state === "error" ? "font-semibold text-red-700" : googleSave.state === "saved" ? "text-emerald-700" : "text-slate-500"}`}
            >
              {googleSave.state === "saving" ? "Saving…" : googleSave.state === "saved" ? "✓ Answer saved to this lead" : `Not saved: ${googleSave.text ?? "try again."}`}
            </p>
          )}
        </section>

        {gi && (
          <section
            aria-label={`Agent response: ${g.options.find((o) => o.value === gi)?.label}`}
            className={`space-y-2 rounded-lg border p-3 ${gi === "yes" ? "border-emerald-400 bg-emerald-50/60" : "border-sky-300 bg-white/80"}`}
            data-testid="google-response"
          >
            <p className={`text-xs font-semibold uppercase tracking-wide ${gi === "yes" ? "text-emerald-800" : "text-sky-700"}`}>{gi === "yes" ? "Recommended response · read this next" : "Read this next"}</p>
            {g.say[gi].map((line) => (
              <Say key={line}>{line}</Say>
            ))}
            {interested && (
              <>
                <div role="group" aria-label="Prospect's preferred time" className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-slate-800">Prefers:</span>
                  {([["morning", "Morning"], ["afternoon", "Afternoon"], ["other", "Another time"]] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={timePref === v}
                      onClick={() => setTimePref(v)}
                      className={`min-h-10 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${timePref === v ? "border-emerald-600 bg-emerald-100 text-emerald-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {gi === "more" && specialistPills}
                {bookButton}
                {notReady}
              </>
            )}
            {gi === "no" && (
              <>
                <Pills
                  label={g.noFollowUp}
                  value={answers.online_customers_satisfied}
                  options={[
                    { value: "satisfied", label: "Satisfied" },
                    { value: "not_satisfied", label: "Not satisfied" },
                  ]}
                  onPick={(v) => patch({ online_customers_satisfied: v })}
                />
                {callEnds ? (
                  <p role="status" className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-800">
                    {g.noEnd} Do not offer a {guide.shortName} appointment.
                  </p>
                ) : (
                  <p className="text-[12px] text-slate-600">{g.noEnd}</p>
                )}
                <AgentNote>{g.optOut.note}</AgentNote>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    data-testid="record-not-interested"
                    disabled={busy || !onRecordOutcome}
                    onClick={() => onRecordOutcome && run(() => onRecordOutcome("Not interested"), "Recorded: Not interested.")}
                    className="min-h-10 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Record outcome: Not interested
                  </button>
                  <button
                    type="button"
                    data-testid="record-do-not-call"
                    disabled={busy || !onRecordOutcome}
                    onClick={() => onRecordOutcome && run(() => onRecordOutcome("Do not call"), "Recorded: Do not call. Do not contact this prospect again.")}
                    className="min-h-10 rounded-full border border-red-400 bg-white px-4 py-1.5 text-[13px] font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                  >
                    {g.optOut.label}
                  </button>
                </div>
                {!onRecordOutcome && <p className="text-[12px] text-slate-500">Open the lead to record the outcome.</p>}
              </>
            )}
            {actionStatus && (
              <p role="status" data-testid="guide-action-status" className={`text-[12.5px] font-semibold ${actionStatus.kind === "error" ? "text-red-700" : "text-emerald-700"}`}>
                {actionStatus.text}
              </p>
            )}
          </section>
        )}

        {bookingOpen && bookingSlot && (
          <section aria-label="Confirm the appointment" className="space-y-2 rounded-lg border border-emerald-300 bg-white/80 p-3">
            <StepHeading n={3}>Confirm the appointment</StepHeading>
            {g.confirmation.say.map((line) => (
              <Say key={line}>{line}</Say>
            ))}
            {bookingSlot}
            <p className="text-[12px] text-slate-600">An appointment goes to Admin for approval before anything is sent to {guide.shortName}.</p>
          </section>
        )}

        {remaining && (
          <section aria-label="Record remaining requirements" className="space-y-3 rounded-lg border border-slate-200 bg-white/60 p-3">
            <div>
              <StepHeading n={4}>Record remaining requirements</StepHeading>
              <p className="mt-0.5 text-[12px] text-slate-600">These can be completed during or after booking. They are not needed before you offer the appointment.</p>
            </div>

            <div className="space-y-2">
              <Say>{g.currentCustomers.label}</Say>
              <Pills label="Receives customers through Google?" value={answers.google_visibility} options={g.currentCustomers.options} onPick={(v) => patch({ google_visibility: v })} />
            </div>

            <div className="space-y-2">
              <Say>{guide.websitePrompt}</Say>
              <Pills
                label="Has a website?"
                value={hasSite}
                options={[...YES_NO_UNSURE]}
                onPick={(v) =>
                  patch({
                    has_website: v,
                    ...(v === "no" ? { satisfied_with_site: "not_applicable" as const, website_url: null } : {}),
                    ...(v !== "no" && answers.satisfied_with_site === "not_applicable" ? { satisfied_with_site: null } : {}),
                  })
                }
              />
              {hasSite === "unsure" && <p className="text-[12.5px] text-slate-600">Ask where customers find them online, or for the website address, then choose Yes or No.</p>}
            </div>

            {branch && (
              <div aria-label={hasSite === "yes" ? "Has a website" : "No website"} className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{hasSite === "yes" ? "Website: improvement or rebranding?" : "No website: new website?"}</p>
                <Say>{branch.say}</Say>
                {hasSite === "yes" && (
                  <input
                    type="text"
                    value={answers.website_url ?? ""}
                    onChange={(e) => patch({ website_url: e.target.value })}
                    placeholder="Website address"
                    aria-label="Website address"
                    className="min-h-10 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.servicePitch.heading}</p>
              {g.servicePitch.say.map((line) => (
                <Say key={line}>{line}</Say>
              ))}
              <AgentNote>{g.servicePitch.agentNote}</AgentNote>
              {g.followUps.map((f) => (
                <Pills key={f.field} label={f.label} value={answers[f.field]} options={f.options} onPick={(v) => patch({ [f.field]: v } as Partial<QualificationAnswers>)} />
              ))}
            </div>

            <div aria-label="Interested services" className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Genuine interest, services and business objective</p>
              <p className="text-[13px] font-semibold text-slate-800">{g.servicesLabel}</p>
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
                      className={`min-h-10 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${answers.services_of_interest.includes(s.key) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {s.label}
                    </button>
                  ))
                )}
              </div>
              <Pills label="Prospect understands the service?" value={yesNo(answers.understands_services)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onPick={(v) => patch({ understands_services: v === "yes" })} />
              <label className="block text-[13px] font-semibold text-slate-800">
                Business need or growth objective (in the prospect&apos;s own words)
                <textarea value={answers.challenges ?? ""} onChange={(e) => patch({ challenges: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
              </label>
            </div>

            <div aria-label="Owner or decision-maker" className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner or decision-maker</p>
              <Say>{g.decisionMaker.say}</Say>
              <Pills label={g.decisionMaker.label} value={answers.decision_maker} options={g.decisionMaker.options} onPick={(v) => patch({ decision_maker: v })} />
              {answers.decision_maker && answers.decision_maker !== "yes" && <AgentNote>{g.decisionMaker.ifNot}</AgentNote>}
            </div>

            <label className="block text-[13px] font-semibold text-slate-800">
              {g.confirmation.requirementsLabel}
              <textarea value={answers.intended_improvements ?? ""} onChange={(e) => patch({ intended_improvements: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="block text-[13px] font-semibold text-slate-800">
              Call notes
              <textarea value={answers.qualification_notes ?? ""} onChange={(e) => patch({ qualification_notes: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>

            <div data-testid="qualified-checklist" className={`rounded-lg border px-3 py-2 ${check.ok ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <p className="text-[13px] font-semibold text-slate-800">{check.ok ? "Ready to save as a qualified appointment" : "A qualified appointment needs all of these"}</p>
              <ul className="mt-1 space-y-0.5 text-[12.5px]">
                {checklist.map((c) => (
                  <li key={c.text} className={c.done ? "text-emerald-800" : "text-slate-600"}>
                    <span aria-hidden>{c.done ? "✓" : "○"}</span> {c.text}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[12px] text-slate-500">A request for information alone is not an appointment.</p>
            </div>
          </section>
        )}

        <section id={`objections-${guide.clientKey}`} aria-label="Objection handling" className="scroll-mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Objection handling · tap to open</p>
          {guide.objections.map((o) => (
            <details key={o.id} className="group rounded-lg border border-amber-200 bg-white">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[13.5px] font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                <span>&ldquo;{o.label}&rdquo;</span>
                <span aria-hidden className="shrink-0 text-amber-700 transition group-open:rotate-45">+</span>
              </summary>
              <div className="space-y-1.5 border-t border-amber-100 px-3 py-2">
                {o.responses.map((line) => (
                  <Say key={line}>{line}</Say>
                ))}
                {o.note && <AgentNote>{o.note}</AgentNote>}
              </div>
            </details>
          ))}
        </section>

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
