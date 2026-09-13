"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CALL_LOG_AUTOMATIC_NOTES,
  CALL_LOG_OUTCOMES,
  CALL_LOG_OUTCOME_STYLES,
  DO_NOT_CALL_OUTCOME,
  formatCallLogDate,
  type CallLogOutcome,
  type CallLogRow,
} from "@/lib/call-log";
import SearchableSelect from "@/components/crm-ui/SearchableSelect";
import RowsPerPagePager, { usePagedRows } from "@/components/crm-ui/RowsPerPagePager";
import Modal from "@/components/Modal";
import CallLogDetailModal, { type CallLogDetailEntry } from "./CallLogDetailModal";

type ActionResult = { error?: string };

// Growth CRM: the Business/Client is always the fixed value shown in
// `value` - no selection needed, so the field renders read-only.
// Lead Gen CRM: the agent must pick one of the CRM's existing clients.
export type BusinessClientField =
  | { mode: "fixed"; value: string }
  | { mode: "select"; options: { id: string; name: string }[] };

type Props = {
  crmLabel: string;
  records: CallLogRow[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  businessClientField: BusinessClientField;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

export default function AgentCallLogClient({ crmLabel, records, createAction, businessClientField }: Props) {
  const [outcome, setOutcome] = useState<CallLogOutcome>("No Answer");
  const [clientId, setClientId] = useState<string | null>(null);
  const automaticNote = CALL_LOG_AUTOMATIC_NOTES[outcome];
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<CallLogDetailEntry | null>(null);
  const [recentSearch, setRecentSearch] = useState("");
  // Item 2: selecting "Do Not Call" must show a confirmation modal before
  // it takes effect - the outcome only actually changes to Do Not Call
  // once the agent confirms; Cancel leaves the previous selection in place.
  const [confirmingDnc, setConfirmingDnc] = useState(false);

  const filteredRecords = useMemo(() => {
    const q = recentSearch.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (record) => record.business_name.toLowerCase().includes(q) || record.phone.toLowerCase().includes(q)
    );
  }, [records, recentSearch]);

  const { pageRows, page, pageCount, pageSize, setPage, setPageSize, totalCount, rangeStart, rangeEnd } = usePagedRows(
    filteredRecords,
    25
  );

  function selectOutcome(next: CallLogOutcome) {
    if (next === DO_NOT_CALL_OUTCOME) {
      setConfirmingDnc(true);
      return;
    }
    setOutcome(next);
    setSaved(false);
  }

  function confirmDoNotCall() {
    setOutcome(DO_NOT_CALL_OUTCOME);
    setSaved(false);
    setConfirmingDnc(false);
  }

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    if (businessClientField.mode === "select" && !clientId) {
      setError("Select a Business / Client.");
      return;
    }
    startTransition(async () => {
      const result = await createAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setOutcome("No Answer");
      setClientId(null);
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

        <div className="mt-4">
          {businessClientField.mode === "fixed" ? (
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Business / Client *
              <input
                value={businessClientField.value}
                readOnly
                disabled
                className={`${inputClass} mt-1 bg-slate-50 text-slate-600`}
              />
              <span className="mt-1 block text-[11px] font-normal normal-case text-slate-400">
                Agents prospect on behalf of Winsalot Corp. — set automatically.
              </span>
            </label>
          ) : (
            <SearchableSelect
              label="Business / Client *"
              placeholder="Search clients…"
              options={businessClientField.options.map((client) => ({ value: client.id, label: client.name }))}
              value={clientId}
              onChange={setClientId}
            />
          )}
          <input type="hidden" name="client_id" value={clientId ?? ""} />
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Recent Calls</h2>
            <p className="text-sm text-slate-500">Your latest 100 call logs.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
            {totalCount}
          </span>
        </div>

        {records.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No calls logged yet.
          </p>
        ) : (
          <>
            <input
              type="search"
              value={recentSearch}
              onChange={(event) => setRecentSearch(event.target.value)}
              placeholder="Search business name or phone number"
              className={`${inputClass} mt-4`}
            />

            {pageRows.length === 0 ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                No calls match your search.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-[720px] w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date &amp; Time</th>
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Business / Client</th>
                      <th className="px-4 py-3">Result</th>
                      <th className="px-4 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((record) => (
                      <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatCallLogDate(record.created_at)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{record.business_name}</td>
                        <td className="px-4 py-3 text-slate-600">{record.businessClient}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${CALL_LOG_OUTCOME_STYLES[record.outcome]}`}>
                            {record.outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(record);
                            }}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <RowsPerPagePager
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              totalCount={totalCount}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
            />
          </>
        )}
      </section>

      {selected && <CallLogDetailModal entry={selected} onClose={() => setSelected(null)} />}

      {confirmingDnc && (
        <Modal title="Add to Do Not Contact?" onClose={() => setConfirmingDnc(false)}>
          <p className="text-sm text-slate-600">
            This contact will be added to the Do Not Contact list and outbound calling will be blocked. Continue?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDnc(false)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDoNotCall}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Add to Do Not Contact
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
