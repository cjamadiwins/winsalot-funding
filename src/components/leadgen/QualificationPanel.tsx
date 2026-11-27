"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import AppointmentBookingForm from "./AppointmentBookingForm";
import type { LeadgenCampaignRow, LeadgenClientRow, LeadgenLeadRow, LeadgenUserRow } from "@/lib/leadgen-types";

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
  // Defaults to the real server action. Injectable only so the click-to-save
  // behaviour can be exercised in a browser test without a signed-in session.
  saveQualification?: typeof saveQualificationAction;
  // Lead page only: what the call guide's BOOK APPOINTMENT / outcome / follow-up
  // buttons need. They use the CRM's existing actions (the same ones the rest
  // of the lead page uses), so approval, notifications and reminders are unchanged.
  booking?: {
    lead: Pick<LeadgenLeadRow, "id" | "business_name" | "contact_name" | "phone" | "email">;
    client: Pick<LeadgenClientRow, "id" | "name">;
    campaign: Pick<LeadgenCampaignRow, "id"> | null;
    agents: Pick<LeadgenUserRow, "id" | "full_name">[];
    currentUserId: string;
    isAdmin: boolean;
    bookAppointment: (formData: FormData) => Promise<{ error?: string; message?: string } | void>;
    recordCallOutcome: (leadId: string, formData: FormData) => Promise<{ error?: string } | void>;
    scheduleFollowUp: (leadId: string, formData: FormData) => Promise<{ error?: string } | void>;
  };
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
export default function QualificationPanel({ leadId, clientName, approvedServices, initial, preliminaryCategory, appointments, agentName = "", saveQualification = saveQualificationAction, booking }: Props) {
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

  // The Google-step buttons save as they are clicked, so the prospect's answer
  // is on the lead straight away and survives a refresh. The save keeps the
  // lead's current status (a draft stays a draft), writes no history entry and
  // never creates or changes an appointment.
  const [googleSave, setGoogleSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; text?: string }>({ state: "idle" });
  const guideChange = (patch: Partial<QualificationAnswers>) => {
    const next = { ...answers, ...patch };
    setAnswers(next);
    if (!("google_interest" in patch) && !("online_customers_satisfied" in patch) && !("specialist_interest" in patch)) return;
    setGoogleSave({ state: "saving" });
    void saveQualification({ leadId, answers: next, outcome, quiet: true }).then(
      (result) => setGoogleSave(result.error ? { state: "error", text: result.error } : { state: "saved" }),
      () => setGoogleSave({ state: "error", text: "Could not save. Check your connection and try again." })
    );
  };

  // BOOK APPOINTMENT: opens the CRM's booking form; nothing is booked until the
  // agent saves it. Saving first records the qualification (which includes the
  // decision-maker, verified contact and confirmed time), then books through the
  // existing booking action, which keeps the Admin approval step.
  const router = useRouter();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [preferredPart, setPreferredPart] = useState<"morning" | "afternoon" | null>(null);
  const [bookingState, setBookingState] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null });
  const [bookedMessage, setBookedMessage] = useState<string | null>(null);
  // Booking records what the agent just confirmed with the prospect. A client
  // that does not offer e-commerce never asks that question, so a blank answer
  // is recorded as "not sure" (nothing established) rather than blocking the booking.
  const answersForBooking: QualificationAnswers = {
    ...answers,
    contact_verified: true,
    appointment_confirmed: true,
    agreed_to_appointment: true,
    specialist_interest: "yes",
    needs_ecommerce: answers.needs_ecommerce ?? (approvedServices.includes("ecommerce") ? null : "unsure"),
  };
  const bookingMissing = bookingOpen ? evaluateQualifiable(answersForBooking, approvedServices).reasons : [];
  const submitBooking = async (formData: FormData) => {
    if (!booking) return;
    setBookingState({ saving: true, error: null });
    const requirements = String(formData.get("service_requirements") ?? "").trim();
    const next: QualificationAnswers = { ...answersForBooking, intended_improvements: requirements || answers.intended_improvements };
    const readiness = evaluateQualifiable(next, approvedServices);
    if (!readiness.ok) {
      setBookingState({ saving: false, error: "This appointment can't be saved yet." });
      return;
    }
    try {
      const saved = await saveQualification({ leadId, answers: next, outcome: "qualified" });
      if (saved.error) {
        setBookingState({ saving: false, error: saved.error });
        return;
      }
      setAnswers(next);
      setOutcome("qualified");
      const result = await booking.bookAppointment(formData);
      if (result && result.error) {
        setBookingState({ saving: false, error: `The qualification was saved, but the appointment was not: ${result.error}` });
        return;
      }
      setBookingState({ saving: false, error: null });
      setBookingOpen(false);
      setBookedMessage((result && result.message) || "Appointment saved. It is waiting for Admin approval; the client and prospect are notified only after it is approved.");
      router.refresh();
    } catch {
      setBookingState({ saving: false, error: "Could not save the appointment. Check your connection and try again." });
    }
  };
  const recordOutcome = async (outcomeLabel: "Not interested" | "Do not call"): Promise<string | null> => {
    if (!booking) return "Open the lead to record the outcome.";
    const fd = new FormData();
    fd.set("call_outcome", outcomeLabel);
    fd.set("notes", outcomeLabel === "Do not call" ? "Prospect asked not to be called or contacted again (recorded from the call guide)." : "Prospect said they are not interested in improving their Google visibility (recorded from the call guide).");
    const result = await booking.recordCallOutcome(leadId, fd);
    return result && result.error ? result.error : null;
  };
  const scheduleFollowUp = async (scheduledAtLocal: string, note: string): Promise<string | null> => {
    if (!booking) return "Open the lead to schedule the follow-up.";
    const when = new Date(scheduledAtLocal);
    if (Number.isNaN(when.getTime())) return "Enter a valid follow-up date and time.";
    const fd = new FormData();
    fd.set("scheduled_at", when.toISOString());
    fd.set("note", note || "Follow up: prospect was interested but not ready to book (from the call guide).");
    const result = await booking.scheduleFollowUp(leadId, fd);
    return result && result.error ? result.error : null;
  };

  const toggleService = (key: string) => set("services_of_interest", answers.services_of_interest.includes(key) ? answers.services_of_interest.filter((s) => s !== key) : [...answers.services_of_interest, key]);

  const save = (next: QualificationOutcome) => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveQualification({ leadId, answers, outcome: next });
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
            onChange={guideChange}
            onMarkNotQualified={() => save("not_qualified")}
            pending={pending}
            googleSave={googleSave}
            onBookAppointment={
              booking
                ? ({ timePreference }) => {
                    setPreferredPart(timePreference);
                    setBookedMessage(null);
                    setBookingState({ saving: false, error: null });
                    setBookingOpen(true);
                    // Bring the booking form into view for the agent.
                    window.setTimeout(() => document.querySelector('[data-testid="appointment-booking-form"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
                  }
                : undefined
            }
            bookingOpen={bookingOpen}
            bookingSlot={
              booking && bookingOpen ? (
                <AppointmentBookingForm
                  lead={booking.lead}
                  client={booking.client}
                  campaign={booking.campaign}
                  agents={booking.agents}
                  currentUserId={booking.currentUserId}
                  isAdmin={booking.isAdmin}
                  isPending={false}
                  onBook={(formData) => void submitBooking(formData)}
                  guided={{ preferredPart, requirements: answers.intended_improvements ?? "", error: bookingState.error, missing: bookingMissing, saving: bookingState.saving }}
                />
              ) : null
            }
            onRecordOutcome={booking ? recordOutcome : undefined}
            onScheduleFollowUp={booking ? scheduleFollowUp : undefined}
            compact
          />
          {bookedMessage && (
            <p role="status" data-testid="booked-message" className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
              {bookedMessage}
            </p>
          )}
          <p className="mt-1.5 text-[11.5px] text-slate-500">Answers in the guide fill the same questions below. The Google question saves as you click it; everything else is saved when you use a save button. Nothing here books an appointment.</p>
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
