"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WinsalotAppointmentsListClient, { type WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import BookConsultationModal from "@/components/BookConsultationModal";
import type { OpportunityType } from "@/lib/crm-types";
import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  editAppointmentAction,
  getOfferedSlotsAction,
  rescheduleAppointmentAction,
  reviewCrmAppointmentIncentiveAction,
} from "./actions";
import { bookConsultationAction, getConsultationOfferedSlotsAction } from "../opportunities/[id]/actions";

export type BookableOpportunity = {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string;
  opportunity_type: OpportunityType;
};

export default function AdminAppointmentsClient({
  appointments,
  opportunities,
  initialOpenAdd,
}: {
  appointments: WinsalotAppointmentListRow[];
  // Every opportunity, for the "Book Appointment" picker below - reuses
  // the exact same BookConsultationModal + bookConsultationAction the
  // opportunity detail page's own "Book Consultation" button already
  // uses, just with an extra "which prospect" step first since this entry
  // point isn't already on one opportunity's page.
  opportunities: BookableOpportunity[];
  // Set by the CRM dashboard's "Book Call / Appointment" button so that
  // click opens the picker immediately instead of landing on a page the
  // admin still has to find the button on.
  initialOpenAdd?: boolean;
}) {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(!!initialOpenAdd);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");

  const selectedOpportunity = opportunities.find((o) => o.id === selectedOpportunityId) ?? null;

  function closeBooking() {
    setShowPicker(false);
    setSelectedOpportunityId("");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => (showPicker ? closeBooking() : setShowPicker(true))}
          className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700"
        >
          {showPicker ? "Cancel" : "+ Book Appointment"}
        </button>
      </div>

      {showPicker && !selectedOpportunity && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Prospect / Client</span>
            <select
              value={selectedOpportunityId}
              onChange={(e) => setSelectedOpportunityId(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900"
            >
              <option value="">Select a prospect…</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.business_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selectedOpportunity && (
        <BookConsultationModal
          businessName={selectedOpportunity.business_name}
          contactName={selectedOpportunity.contact_name}
          email={selectedOpportunity.email}
          phone={selectedOpportunity.phone}
          opportunityType={selectedOpportunity.opportunity_type}
          getOfferedSlots={getConsultationOfferedSlotsAction}
          onBook={(input) => bookConsultationAction(selectedOpportunity.id, input)}
          onClose={closeBooking}
          onBooked={() => {
            closeBooking();
            router.refresh();
          }}
        />
      )}

      <WinsalotAppointmentsListClient
        appointments={appointments}
        isAdmin
        actions={{
          getOfferedSlots: getOfferedSlotsAction,
          reschedule: rescheduleAppointmentAction,
          cancel: cancelAppointmentAction,
          edit: editAppointmentAction,
          remove: deleteAppointmentAction,
          reviewIncentive: reviewCrmAppointmentIncentiveAction,
          opportunityHref: (opportunityId) => `/admin/crm/opportunities/${opportunityId}`,
        }}
      />
    </div>
  );
}
