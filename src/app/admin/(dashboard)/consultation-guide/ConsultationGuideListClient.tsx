"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS,
  CONSULTATION_GUIDE_FOLLOW_UP_STATUS_STYLES,
  CONSULTATION_GUIDE_SERVICE_LABELS,
  CONSULTATION_GUIDE_STATUS_LABELS,
  CONSULTATION_GUIDE_STATUS_STYLES,
  type CrmConsultationGuideRow,
} from "@/lib/consultation-guide";

export type ConsultationGuideListRow = Pick<
  CrmConsultationGuideRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "status"
  | "business_name"
  | "contact_name"
  | "consultation_date"
  | "consultant_name"
  | "opportunity_id"
  | "appointment_id"
  | "service"
  | "follow_up_email_status"
>;

// Client half of the admin-only Client Consultation Guide index - holds
// the list in local state so a confirmed Delete can remove just that one
// row and show a success message without a full page reload, per CJ's
// "After deletion, remove only the consultation from the list and show a
// success message." Deleting only ever removes the crm_consultation_guides
// row itself (see deleteConsultationGuideAction) - the linked appointment,
// prospect, and its email/audit history are never touched.
export default function ConsultationGuideListClient({
  guides: initialGuides,
  deleteAction,
}: {
  guides: ConsultationGuideListRow[];
  deleteAction: (id: string) => Promise<{ error?: string }>;
}) {
  const [guides, setGuides] = useState(initialGuides);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDelete(guide: ConsultationGuideListRow) {
    if (!confirm("Delete this consultation record? This cannot be undone.")) return;
    setError(null);
    setMessage(null);
    setDeletingId(guide.id);
    startTransition(async () => {
      const result = await deleteAction(guide.id);
      if (result.error) {
        setDeletingId(null);
        setError(result.error);
        return;
      }
      setGuides((prev) => prev.filter((g) => g.id !== guide.id));
      setDeletingId(null);
      setMessage(`Deleted the consultation record for ${guide.business_name || "Untitled consultation"}.`);
    });
  }

  return (
    <div>
      {message && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{message}</p>
      )}
      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Appointment</th>
                <th className="px-3 py-2">Consultant</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Follow-Up Email</th>
                <th className="px-3 py-2">Last Updated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {guides.map((guide) => (
                <tr key={guide.id} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-[220px] px-3 py-2 font-medium text-slate-900">
                    {/* Opens the related prospect/business record when this
                        consultation is linked to one; the actions on the
                        right always act on the guide itself. */}
                    {guide.opportunity_id ? (
                      <Link href={`/admin/crm/opportunities/${guide.opportunity_id}`} className="line-clamp-2 break-words hover:text-sky-600">
                        {guide.business_name || "Untitled consultation"}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 break-words">{guide.business_name || "Untitled consultation"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{guide.contact_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{guide.service ? CONSULTATION_GUIDE_SERVICE_LABELS[guide.service] : "—"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {guide.appointment_id ? (
                      <Link href={`/admin/crm/appointments#appointment-${guide.appointment_id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                        View
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{guide.consultant_name || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${CONSULTATION_GUIDE_STATUS_STYLES[guide.status]}`}
                    >
                      {CONSULTATION_GUIDE_STATUS_LABELS[guide.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {guide.status === "completed" ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${CONSULTATION_GUIDE_FOLLOW_UP_STATUS_STYLES[guide.follow_up_email_status]}`}
                      >
                        {CONSULTATION_GUIDE_FOLLOW_UP_STATUS_LABELS[guide.follow_up_email_status]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{new Date(guide.updated_at).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="inline-flex gap-1.5">
                      {guide.status === "completed" ? (
                        // Completed consultations stay viewable and editable
                        // for future reference, as two distinct actions -
                        // View opens the printable/read-only PDF, Edit opens
                        // the same editable record a draft uses.
                        <>
                          <a
                            href={`/admin/consultation-guide/${guide.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            View
                          </a>
                          <Link
                            href={`/admin/consultation-guide/${guide.id}`}
                            className="inline-flex whitespace-nowrap rounded-md border border-sky-600 px-2.5 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-600 hover:text-white"
                          >
                            Edit
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={`/admin/consultation-guide/${guide.id}`}
                          className="inline-flex whitespace-nowrap rounded-md border border-sky-600 px-2.5 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-600 hover:text-white"
                        >
                          Open
                        </Link>
                      )}
                      <button
                        type="button"
                        disabled={isPending && deletingId === guide.id}
                        onClick={() => handleDelete(guide)}
                        className="inline-flex whitespace-nowrap rounded-md border border-rose-600 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending && deletingId === guide.id ? "Deleting…" : "Delete"}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}

              {guides.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No consultations logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
