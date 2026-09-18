"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchAppointmentsAction, type AppointmentSearchResult } from "./actions";

// "If the consultation guide is opened without an appointment ID, allow
// Admin to search for and select an existing appointment. Also permit a
// manual consultation when no appointment exists." Selecting a result
// simply navigates to this same page with ?appointmentId= set, which
// re-runs the server-side prefill in new/page.tsx - this component never
// prefills anything itself.
export default function AppointmentPicker() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppointmentSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  function runSearch(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    startTransition(async () => {
      const found = await searchAppointmentsAction(value);
      setResults(found);
      setSearched(true);
    });
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <h2 className="text-[15px] font-bold text-slate-900">Link an Existing Appointment (optional)</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Search for a booked consultation appointment to prefill this guide, or skip this and fill it in manually below.
      </p>
      <input
        type="text"
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search by business or contact name…"
        className="mt-3 w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />
      {isPending && <p className="mt-2 text-[12px] text-slate-500">Searching…</p>}
      {!isPending && searched && results.length === 0 && <p className="mt-2 text-[12px] text-slate-500">No matching appointments found.</p>}
      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {results.map((appt) => (
            <li key={appt.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-[13px]">
              <div>
                <p className="font-semibold text-slate-800">{appt.business_name}</p>
                <p className="text-slate-500">
                  {appt.contact_name} · {new Date(appt.appointment_start_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/admin/consultation-guide/new?appointmentId=${appt.id}`)}
                className="rounded-md border border-sky-600 px-2.5 py-1 text-[11.5px] font-semibold text-sky-600 transition hover:bg-sky-600 hover:text-white"
              >
                Use This
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
