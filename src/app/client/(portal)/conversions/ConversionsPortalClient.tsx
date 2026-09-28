"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReportConversionModal from "@/components/leadgen/ReportConversionModal";
import { LEADGEN_CONVERSION_STATUS_LABELS, LEADGEN_CONVERSION_STATUS_STYLES, type LeadgenConversionStatus } from "@/lib/leadgen-conversions";
import { reportConversionAction } from "./actions";

export type ClientConversionRow = {
  conversionId: string;
  businessName: string;
  appointmentDate: string | null;
  appointmentTime: string | null;
  conversionStatus: LeadgenConversionStatus;
  updatedAt: string;
};

// Client Portal "Conversions" section (brief). Every row here is scoped
// server-side to this client's own client_id (see page.tsx) - this
// component only ever renders what it's given and only ever submits
// against the conversionId of the row whose modal is open.
export default function ConversionsPortalClient({ rows }: { rows: ClientConversionRow[] }) {
  const router = useRouter();
  const [openRow, setOpenRow] = useState<ClientConversionRow | null>(null);

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
      {rows.length === 0 ? (
        <p className="p-6 text-center text-[13.5px] text-slate-500">No Winsalot-generated opportunities yet.</p>
      ) : (
        <table className="w-full min-w-[700px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
              <th className="p-3">Prospect / Business Name</th>
              <th className="p-3">Appointment Date</th>
              <th className="p-3">Current Conversion Status</th>
              <th className="p-3">Date Last Updated</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.conversionId} className="border-b border-slate-100">
                <td className="p-3 font-semibold text-slate-900">{row.businessName}</td>
                <td className="p-3 text-slate-600">
                  {row.appointmentDate ?? "—"} {row.appointmentTime ?? ""}
                </td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEADGEN_CONVERSION_STATUS_STYLES[row.conversionStatus]}`}>
                    {LEADGEN_CONVERSION_STATUS_LABELS[row.conversionStatus]}
                  </span>
                </td>
                <td className="p-3 text-slate-500">{new Date(row.updatedAt).toLocaleDateString()}</td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => setOpenRow(row)}
                    className="rounded-full border border-[var(--crm-accent,#3e7ef7)]/40 px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--crm-accent,#3e7ef7)] hover:bg-[var(--crm-bg-2,#eaf0f6)]"
                  >
                    Report Conversion
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {openRow && (
        <ReportConversionModal
          businessName={openRow.businessName}
          onClose={() => setOpenRow(null)}
          onSubmit={(formData) => reportConversionAction(openRow.conversionId, formData)}
          onSubmitted={() => {
            setOpenRow(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
