"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LeadgenClientRow } from "@/lib/leadgen-types";
import { slugifyClientName } from "@/lib/leadgen-types";
import { cleanupLeadgenTestClientsAction, createClientAction } from "../actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

export default function ClientsListClient({ clients }: { clients: LeadgenClientRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await createClientAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setName("");
      setSlug("");
      setSlugTouched(false);
      if (result.clientId) router.push(`/leadgen/admin/clients/${result.clientId}`);
    });
  }

  function handleCleanup() {
    if (!confirm("Delete test clients Chijioke Amadi and Winsalot Corp. plus linked test records? Brent's Essentials will not be touched.")) {
      return;
    }

    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await cleanupLeadgenTestClientsAction();
      if (result.error) {
        setError(result.error);
        return;
      }

      const details = (result.summaries ?? [])
        .map(
          (s) =>
            `${s.clientName}: emails ${s.deletedEmails}, appointments ${s.deletedAppointments}, follow-ups ${s.deletedFollowUps}, activities ${s.deletedActivities}, leads ${s.deletedLeads}, campaigns ${s.deletedCampaigns}, client users ${s.deletedClientUsers}`
        )
        .join(" | ");

      setInfo(details || "Cleanup completed.");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">All Clients ({clients.length})</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCleanup}
            disabled={isPending}
            className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remove Test Clients
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700"
          >
            {showForm ? "Cancel" : "+ Add Client"}
          </button>
        </div>
      </div>

      {info && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">{info}</p>}

      {showForm && (
        <form
          action={handleSubmit}
          className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Client Name</span>
            <input
              name="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugifyClientName(e.target.value));
              }}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">URL Slug</span>
            <input
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              className={inputClass}
            />
            <span className="text-[11.5px] text-slate-400">leads.winsalotcorp.com/client/{slug || "…"}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Contact Name</span>
            <input name="contact_name" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Contact Email</span>
            <input name="contact_email" type="email" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Contact Phone</span>
            <input name="contact_phone" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Default Booking Link (optional)</span>
            <input name="booking_link" type="url" placeholder="https://..." className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-semibold text-slate-600">Internal Notes</span>
            <textarea name="notes" className={`${inputClass} min-h-[60px] resize-y`} />
          </label>

          {error && <p className="text-[13px] font-medium text-rose-600 sm:col-span-2">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-sky-700 sm:col-span-2 sm:w-fit"
          >
            {isPending ? "Creating…" : "Create Client"}
          </button>
        </form>
      )}

      {clients.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-[13.5px] text-slate-500">
          No clients yet. Add your first client to get started.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[520px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="p-3">Client</th>
                <th className="p-3">Slug</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-slate-100">
                  <td className="p-3">
                    <Link href={`/leadgen/admin/clients/${client.id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                      {client.name}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-500">/{client.slug}</td>
                  <td className="p-3 text-slate-600">{client.contact_name || client.contact_email || "—"}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        client.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {client.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
