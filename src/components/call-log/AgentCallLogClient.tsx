"use client";

import { useState, useTransition } from "react";
import {
  CALL_LOG_AUTOMATIC_NOTES,
  CALL_LOG_OUTCOMES,
  CALL_LOG_OUTCOME_STYLES,
  formatCallLogDate,
  type CallLogOutcome,
  type CallLogRow,
} from "@/lib/call-log";

type ActionResult = { error?: string };

type Props = {
  crmLabel: string;
  records: CallLogRow[];
  createAction: (formData: FormData) => Promise<ActionResult>;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export default function AgentCallLogClient({ crmLabel, records, createAction }: Props) {
  const [outcome, setOutcome] = useState<CallLogOutcome>("No Answer");
  const automaticNote = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function selectOutcome(next: CallLogOutcome) {
    setOutcome(next);
    setSaved(false);
  }

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await createAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setOutcome("No Answer");
      setFormKey((key) => key + 1);
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Call Log</h1>
      <p className="mt-1 text-sm text-slate-500">
        Record every {crmLabel} call, including calls that do not become a lead or opportunity.
      </p>

      <form key={formKey} action={submit} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Business Name
            <input
              name="business_name"
              required
              autoFocus
              placeholder="Paste business name"
              autoComplete="off"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Phone Number
            <input
              name="phone"
              required
              inputMode="tel"
              placeholder="Paste phone number"
              autoComplete="off"
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Call Result</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CALL_LOG_OUTCOMES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => selectOutcome(item)}
                className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                  outcome === item
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <input type="hidden" name="outcome" value={outcome} />
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Automatic Note
            <input
              name="automatic_note"
              value={automaticNote}
              readOnly
              className={`${inputClass} mt-1 bg-slate-50`}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Extra Details (optional)
            <input
              name="extra_details"
              placeholder="Add anything important"
              autoComplete="off"
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        {saved ? <p className="mt-3 text-sm font-medium text-emerald-700">Call saved successfully.</p> : null}

        <button
          type="submit"
          disabled={isPending}
          className="mt-4 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save Call"}
        </button>
      </form>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Recent Calls</h2>
            <p className="text-sm text-slate-500">Your latest 100 call logs.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
            {records.length}
          </span>
        </div>

        {records.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No calls logged yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr key={record.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatCallLogDate(record.created_at)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{record.business_name}</td>
                    <td className="px-4 py-3 text-slate-600">{record.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${CALL_LOG_OUTCOME_STYLES[record.outcome]}`}>
                        {record.outcome}
                      </span>
                    </td>
                    <td className="max-w-md whitespace-pre-wrap px-4 py-3 text-slate-700">{record.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
