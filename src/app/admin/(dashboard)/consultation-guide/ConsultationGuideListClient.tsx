"use client";

import { useState } from "react";
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

// Client half of the admin-only Client Consultation Guide index - kept
// compact, with only View and Edit (or Open, for a draft) per row.
// Delete lives inside the Edit Consultation page instead (see
// ConsultationGuideForm's "Delete consultation" link), which redirects
// back here with ?deleted=<business name> on success; successMessage
// (read from that param by the server page) is what turns into the
// banner below.
export default function ConsultationGuideListClient({
  guides,
  successMessage,
}: {
  guides: ConsultationGuideListRow[];
  successMessage?: string | null;
}) {
  const [message, setMessage] = useState(successMessage ?? null);

  return (
    <div>
      {message && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="font-semibold text-emerald-600 hover:text-emerald-800">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        {/* No forced min-width here (dropped in #349) - with the Delete
            button already gone from this row (moved to the Edit page in
            #348), the table's natural width comfortably fits a standard
            desktop viewport next to the sidebar without a horizontal
            scrollbar; overflow-x-auto stays only as a safety net for
            genuinely narrow viewports. */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2.5 py-1.5">Business</th>
                <th className="px-2.5 py-1.5">Contact</th>
                <th className="px-2.5 py-1.5">Service</th>
                <th className="px-2.5 py-1.5">Appointment</th>
                <th className="px-2.5 py-1.5">Consultant</th>
                <th className="px-2.5 py-1.5">Status</th>
                <th className="px-2.5 py-1.5">Follow-Up Email</th>
                <th className="px-2.5 py-1.5">Last Updated</th>
                <th className="px-2.5 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {guides.map((guide) => (
                <tr key={guide.id} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-[180px] px-2.5 py-1.5 font-medium text-slate-900">
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
                  <td className="px-2.5 py-1.5 text-slate-600">{guide.contact_name || "—"}</td>
                  <td className="px-2.5 py-1.5 text-slate-600">{guide.service ? CONSULTATION_GUIDE_SERVICE_LABELS[guide.service] : "—"}</td>
                  <td className="px-2.5 py-1.5 text-slate-600">
                    {guide.appointment_id ? (
                      <Link href={`/admin/crm/appointments#appointment-${guide.appointment_id}`} className="font-semibold text-sky-600 hover:text-sky-700">
                        View
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-slate-600">{guide.consultant_name || "—"}</td>
                  <td className="px-2.5 py-1.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${CONSULTATION_GUIDE_STATUS_STYLES[guide.status]}`}
                    >
                      {CONSULTATION_GUIDE_STATUS_LABELS[guide.status]}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5">
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
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-slate-600">{new Date(guide.updated_at).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
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
                            className="inline-flex whitespace-nowrap rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            View
                          </a>
                          <Link
                            href={`/admin/consultation-guide/${guide.id}`}
                            className="inline-flex whitespace-nowrap rounded-md border border-sky-600 px-2 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-600 hover:text-white"
                          >
                            Edit
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={`/admin/consultation-guide/${guide.id}`}
                          className="inline-flex whitespace-nowrap rounded-md border border-sky-600 px-2 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-600 hover:text-white"
                        >
                          Open
                        </Link>
                      )}
                    </span>
                  </td>
                </tr>
              ))}

              {guides.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-2.5 py-8 text-center text-slate-500">
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
