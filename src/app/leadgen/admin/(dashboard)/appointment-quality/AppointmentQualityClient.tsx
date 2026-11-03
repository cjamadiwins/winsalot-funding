"use client";

import { useState, useTransition } from "react";
import {
  QC_STATUS_LABELS,
  QC_STATUS_STYLES,
  QUALIFICATION_CATEGORY_LABELS,
  QUALIFICATION_QUESTIONS,
  QUALIFICATION_SERVICE_KEYS,
  QUALIFICATION_SERVICE_LABELS,
  REJECTION_REASON_OPTIONS,
  acceptanceRate,
  isCustomService,
  serviceLabel,
  type QcMetrics,
  type QcStatus,
} from "@/lib/leadgen-qualification";
import type { AppointmentQualityData, ClientSettingsItem, LegacyItem, QueueItem } from "@/lib/leadgen-appointment-quality-data";
import { reviewAppointmentQualityAction, reviewLegacyFlagAction, saveQualificationSettingsAction } from "@/app/leadgen/qualification-actions";

const card = "rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4 sm:p-5";
const btn = "rounded-full px-3.5 py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

function Notice({ result }: { result: { error?: string; message?: string } | null }) {
  if (!result || (!result.error && !result.message)) return null;
  return (
    <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-[13px] ${result.error ? "border border-red-200 bg-red-50 text-red-800" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      {result.error ?? result.message}
    </p>
  );
}

const yn = (v: string | boolean | null) => (v === null ? "Not answered" : v === true ? "Yes" : v === false ? "No" : v === "unsure" ? "Not sure" : v.replace(/_/g, " "));

function AnswersView({ item }: { item: QueueItem }) {
  const q = item.qualification;
  if (!q) return <p className="mt-2 text-sm text-slate-600">No qualification has been recorded for this lead.</p>;
  const values: Record<string, string> = {
    has_website: q.has_website === "yes" && q.website_url ? `Yes - ${q.website_url}` : yn(q.has_website),
    interested_in_new_or_redesign: yn(q.interested_in_new_or_redesign),
    satisfied_with_site: yn(q.satisfied_with_site),
    needs_ecommerce: yn(q.needs_ecommerce),
    interested_in_seo: yn(q.interested_in_seo),
    challenges: q.challenges?.trim() || "Not answered",
    understands_services: yn(q.understands_services),
    agreed_to_appointment: yn(q.agreed_to_appointment),
  };
  return (
    <div className="mt-2 text-sm">
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {QUALIFICATION_QUESTIONS.map((question) => (
          <div key={question.key} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-[12px] text-slate-500">{question.label}</dt>
            <dd className="font-medium text-slate-900">{values[question.key]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2">
        <span className="font-semibold text-slate-700">Services of interest:</span> {q.services_of_interest.length ? q.services_of_interest.map(serviceLabel).join(", ") : "None selected"}
      </p>
      {q.intended_improvements && (
        <p>
          <span className="font-semibold text-slate-700">Wants to improve:</span> {q.intended_improvements}
        </p>
      )}
      {q.qualification_notes && (
        <p>
          <span className="font-semibold text-slate-700">Notes:</span> {q.qualification_notes}
        </p>
      )}
      <p className="mt-1 text-[12.5px] text-slate-500">
        Category: {q.category ? QUALIFICATION_CATEGORY_LABELS[q.category] : "Not set"} ({q.category_source === "agent_verified" ? "verified by agent" : "preliminary"}) · Outcome: {q.outcome.replace(/_/g, " ")}
        {q.lead_gen_only ? " · Prospect wants lead generation only" : ""}
      </p>
    </div>
  );
}

function ReviewCard({ item, highlighted }: { item: QueueItem; highlighted: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reasonOption, setReasonOption] = useState<string>(REJECTION_REASON_OPTIONS[0]);
  const [detail, setDetail] = useState("");
  const awaiting = item.qcStatus === "pending_review";

  const run = (decision: "approve" | "reject" | "request_info") =>
    startTransition(async () => {
      setResult(await reviewAppointmentQualityAction({ appointmentId: item.id, decision, reasonOption, detail, feedback }));
    });

  return (
    <li id={`appt-${item.id}`} className={`rounded-xl border p-4 ${highlighted ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-bold text-slate-900">{item.businessName}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${QC_STATUS_STYLES[item.qcStatus as QcStatus]}`}>{QC_STATUS_LABELS[item.qcStatus as QcStatus]}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700">{item.clientName}</span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-slate-500">
        {item.contactName ? `${item.contactName} · ` : ""}
        {item.appointmentDate} {item.appointmentTime.slice(0, 5)} ({item.timezone}) · Agent: {item.agentName ?? "Unassigned"}
        {item.submittedAt ? ` · Submitted ${new Date(item.submittedAt).toLocaleString()}` : ""}
      </p>
      {item.qcStatus === "needs_info" && item.adminFeedback && <p className="mt-1 text-[12.5px] text-blue-800">You asked: {item.adminFeedback}</p>}

      <details className="mt-2" open={awaiting}>
        <summary className="cursor-pointer text-[13px] font-semibold text-sky-700">Qualification answers</summary>
        <AnswersView item={item} />
      </details>

      {item.blockers.length > 0 && (
        <ul className="mt-2 list-disc rounded-lg border border-amber-200 bg-amber-50 py-2 pl-7 pr-3 text-[12.5px] text-amber-900">
          {item.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
          <li className="list-none text-amber-800">It cannot be approved until these are resolved. You can request more qualification or reject it.</li>
        </ul>
      )}

      {awaiting && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[13px] font-semibold text-slate-800">Ask the agent to qualify further</p>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="What should the agent confirm?" className={`${input} mt-1.5`} />
            <button type="button" disabled={pending || !feedback.trim()} onClick={() => run("request_info")} className={`${btn} mt-2 border border-blue-300 text-blue-800 hover:bg-blue-50`}>
              Request more qualification
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[13px] font-semibold text-slate-800">Reject</p>
            <select value={reasonOption} onChange={(e) => setReasonOption(e.target.value)} className={`${input} mt-1.5`}>
              {REJECTION_REASON_OPTIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Details (optional)" className={`${input} mt-1.5`} />
            <button type="button" disabled={pending} onClick={() => run("reject")} className={`${btn} mt-2 border border-red-300 text-red-700 hover:bg-red-50`}>
              Reject appointment
            </button>
          </div>
        </div>
      )}
      {item.qcStatus === "needs_info" && (
        <div className="mt-3">
          <button type="button" disabled={pending} onClick={() => run("reject")} className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}>
            Reject instead ({reasonOption})
          </button>
        </div>
      )}
      {awaiting && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending || item.blockers.length > 0} onClick={() => run("approve")} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            Approve and release notifications
          </button>
          <span className="text-[12px] text-slate-500">Approving tells the client and the prospect for the first time.</span>
        </div>
      )}
      <Notice result={result} />
    </li>
  );
}

function DecidedTable({ items }: { items: QueueItem[] }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-slate-500">No decisions yet.</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[12px] uppercase text-slate-500">
          <tr>
            <th className="py-1.5 pr-3">Business</th>
            <th className="pr-3">Client</th>
            <th className="pr-3">Agent</th>
            <th className="pr-3">Decision</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-t border-slate-100">
              <td className="py-1.5 pr-3 font-medium text-slate-900">{i.businessName}</td>
              <td className="pr-3">{i.clientName}</td>
              <td className="pr-3">{i.agentName ?? "-"}</td>
              <td className="pr-3">
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${QC_STATUS_STYLES[i.qcStatus as QcStatus]}`}>{QC_STATUS_LABELS[i.qcStatus as QcStatus]}</span>
              </td>
              <td className="text-slate-600">{i.rejectionReason ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegacyRow({ item }: { item: LegacyItem }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(item.adminNote ?? "");
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const run = (status: "reviewed_ok" | "reviewed_issue" | "open") => startTransition(async () => setResult(await reviewLegacyFlagAction({ appointmentId: item.appointmentId, status, note })));
  return (
    <li className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">{item.businessName}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700">{item.clientName}</span>
        <span className="text-[12.5px] text-slate-500">
          {item.appointmentDate} · {item.status}
          {item.agentName ? ` · ${item.agentName}` : ""}
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${item.reviewStatus === "open" ? "bg-amber-100 text-amber-800" : item.reviewStatus === "reviewed_ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          {item.reviewStatus === "open" ? "Needs review" : item.reviewStatus === "reviewed_ok" ? "Reviewed - fine" : "Reviewed - issue"}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-amber-900">{item.reason}</p>
      {item.notes && <p className="mt-1 text-[12.5px] text-slate-600">Agent note: {item.notes}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin note" className={`${input} max-w-sm`} />
        <button type="button" disabled={pending} onClick={() => run("reviewed_ok")} className={`${btn} border border-emerald-300 text-emerald-800 hover:bg-emerald-50`}>
          Mark fine
        </button>
        <button type="button" disabled={pending} onClick={() => run("reviewed_issue")} className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}>
          Mark as issue
        </button>
        {item.reviewStatus !== "open" && (
          <button type="button" disabled={pending} onClick={() => run("open")} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            Reopen
          </button>
        )}
      </div>
      <Notice result={result} />
    </li>
  );
}

function MetricRow({ label, m, strong }: { label: string; m: QcMetrics; strong?: boolean }) {
  const rate = acceptanceRate(m);
  const cell = "px-2 py-1.5 text-right tabular-nums";
  return (
    <tr className={`border-t border-slate-100 ${strong ? "bg-slate-50 font-semibold" : ""}`}>
      <td className="px-2 py-1.5">{label}</td>
      <td className={cell}>{m.contacted}</td>
      <td className={cell}>{m.qualified}</td>
      <td className={cell}>{m.leadGenOnly}</td>
      <td className={cell}>{m.submitted}</td>
      <td className={cell}>{m.approved}</td>
      <td className={cell}>{m.rejected}</td>
      <td className={cell}>{rate === null ? "-" : `${rate}%`}</td>
      <td className={cell}>{m.completed}</td>
      <td className={cell}>{m.converted}</td>
    </tr>
  );
}

function SettingsCard({ item }: { item: ClientSettingsItem }) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(item.enabled);
  const standard = item.approvedServices.filter((s) => !isCustomService(s));
  const [services, setServices] = useState<string[]>(standard);
  const [custom, setCustom] = useState(item.approvedServices.filter(isCustomService).map(serviceLabel).join("\n"));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const toggle = (key: string) => setServices((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  const save = () =>
    startTransition(async () => {
      setResult(await saveQualificationSettingsAction({ clientId: item.clientId, enabled, services, customServices: custom.split("\n").map((l) => l.trim()).filter(Boolean), notes }));
    });
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-slate-900">{item.clientName}</h3>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Require qualification + Admin approval
        </label>
      </div>
      {!item.configured && <p className="mt-1 text-[12.5px] text-slate-500">Not configured yet - appointments for this client are not reviewed.</p>}
      <p className="mt-2 text-[13px] font-semibold text-slate-700">Services this client offers</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {QUALIFICATION_SERVICE_KEYS.map((key) => (
          <label key={key} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-medium ${services.includes(key) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
            <input type="checkbox" className="sr-only" checked={services.includes(key)} onChange={() => toggle(key)} />
            {QUALIFICATION_SERVICE_LABELS[key]}
          </label>
        ))}
      </div>
      <label className="mt-3 block text-[13px] font-semibold text-slate-700">
        Other confirmed services (one per line)
        <textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={2} className={`${input} mt-1 font-normal`} />
      </label>
      <label className="mt-2 block text-[13px] font-semibold text-slate-700">
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${input} mt-1 font-normal`} />
      </label>
      <button type="button" disabled={pending} onClick={save} className={`${btn} mt-3 bg-sky-600 text-white hover:bg-sky-700`}>
        Save settings
      </button>
      <Notice result={result} />
    </div>
  );
}

export default function AppointmentQualityClient({ data, highlight }: { data: AppointmentQualityData; highlight: string | null }) {
  const openLegacy = data.legacy.filter((l) => l.reviewStatus === "open").length;
  return (
    <div className="grid gap-5">
      {data.migrationMissing && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          Appointment Quality Control has not been enabled in the database yet (migration pending). Nothing is gated and no appointment is held for review.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={card}>
          <p className="text-[12px] uppercase text-slate-500">Awaiting your approval</p>
          <p className="text-3xl font-bold text-amber-700">{data.queue.filter((q) => q.qcStatus === "pending_review").length}</p>
        </div>
        <div className={card}>
          <p className="text-[12px] uppercase text-slate-500">Sent back to agents</p>
          <p className="text-3xl font-bold text-blue-700">{data.queue.filter((q) => q.qcStatus === "needs_info").length}</p>
        </div>
        <div className={card}>
          <p className="text-[12px] uppercase text-slate-500">Older appointments to review</p>
          <p className="text-3xl font-bold text-slate-800">{openLegacy}</p>
        </div>
      </div>

      <section className={card} aria-label="Appointments awaiting review">
        <h2 className="text-base font-bold text-slate-900">Appointments awaiting review</h2>
        <p className="text-[12.5px] text-slate-500">The client and the prospect hear nothing about these until you approve them.</p>
        {data.queue.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing is waiting.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {data.queue.map((item) => (
              <ReviewCard key={item.id} item={item} highlighted={highlight === item.id} />
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-label="Performance by client and agent">
        <h2 className="text-base font-bold text-slate-900">Qualification and approval results</h2>
        {data.metrics.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No data yet for clients that require qualification.</p>
        ) : (
          data.metrics.map((group) => (
            <div key={group.clientId} className="mt-4">
              <h3 className="text-[14px] font-bold text-slate-800">{group.clientName}</h3>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="text-[11.5px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-1 text-left">Agent</th>
                      <th className="px-2 text-right">Leads contacted</th>
                      <th className="px-2 text-right">Qualified</th>
                      <th className="px-2 text-right">Lead-gen only</th>
                      <th className="px-2 text-right">Submitted</th>
                      <th className="px-2 text-right">Approved</th>
                      <th className="px-2 text-right">Rejected</th>
                      <th className="px-2 text-right">Acceptance</th>
                      <th className="px-2 text-right">Completed</th>
                      <th className="px-2 text-right">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    <MetricRow label={`${group.clientName} total`} m={group.totals} strong />
                    {group.agents.map((a) => (
                      <MetricRow key={a.agentId ?? "none"} label={a.agentName} m={a.metrics} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[12.5px] text-slate-600">
                Rejection reasons:{" "}
                {Object.keys(group.totals.rejectionReasons).length === 0
                  ? "none yet"
                  : Object.entries(group.totals.rejectionReasons)
                      .sort((x, y) => y[1] - x[1])
                      .map(([reason, n]) => `${reason} (${n})`)
                      .join(" · ")}
                {group.totals.pending + group.totals.needsInfo > 0 ? ` · In review: ${group.totals.pending + group.totals.needsInfo}` : ""}
              </p>
            </div>
          ))
        )}
      </section>

      <section className={card} aria-label="Older appointments flagged for review">
        <h2 className="text-base font-bold text-slate-900">Older appointments flagged for review</h2>
        <p className="text-[12.5px] text-slate-500">Existing appointments where the prospect&apos;s interest in website services is unclear. These are flags only: no appointment, outcome or history is changed.</p>
        {data.legacy.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing flagged.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {data.legacy.map((item) => (
              <LegacyRow key={item.appointmentId} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-label="Recent decisions">
        <h2 className="text-base font-bold text-slate-900">Recent decisions</h2>
        <DecidedTable items={data.recent} />
      </section>

      <section className={card} aria-label="Client qualification settings">
        <h2 className="text-base font-bold text-slate-900">Client services and rules</h2>
        <p className="text-[12.5px] text-slate-500">Each client has its own approved services. One client&apos;s services are never assumed for another.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {data.settings.map((s) => (
            <SettingsCard key={s.clientId} item={s} />
          ))}
        </div>
      </section>
    </div>
  );
}
