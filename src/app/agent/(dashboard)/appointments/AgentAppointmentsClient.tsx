"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WinsalotAppointmentsListClient, { type WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import BookConsultationModal from "@/components/BookConsultationModal";
import type { OpportunityType } from "@/lib/crm-types";
import { cancelAppointmentAction, editAppointmentAction, getOfferedSlotsAction, rescheduleAppointmentAction } from "./actions";
import { bookConsultationAction, getConsultationOfferedSlotsAction } from "../opportunities/[id]/actions";

export type BookableOpportunity = {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string;
  opportunity_type: OpportunityType;
};

export default function AgentAppointmentsClient({
  appointments,
  opportunities,
  initialOpenAdd,
}: {
  appointments: WinsalotAppointmentListRow[];
  // Every opportunity assigned to this agent (RLS-scoped already) - the
  // "Book Appointment" picker below, reusing the same BookConsultationModal
  // + bookConsultationAction their own opportunity detail page's "Book
  // Consultation" button already uses.
  opportunities: BookableOpportunity[];
  // Set by the agent dashboard's "Book Call / Appointment" button.
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
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          {showPicker ? "Cancel" : "+ Book Appointment"}
        </button>
      </div>

      {showPicker && !selectedOpportunity && (
        opportunities.length === 0 ? (
          <p className="mb-4 rounded-2xl border border-dashed border-[var(--color-border)] p-4 text-[13.5px] text-[var(--color-text-muted)]">
            No opportunities assigned to you yet.
          </p>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--crm-surface)] p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--color-ink-mute)]">Prospect / Client</span>
              <select
                value={selectedOpportunityId}
                onChange={(e) => setSelectedOpportunityId(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-[14px]"
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
        )
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
        isAdmin={false}
        actions={{
          getOfferedSlots: getOfferedSlotsAction,
          reschedule: rescheduleAppointmentAction,
          cancel: cancelAppointmentAction,
          edit: editAppointmentAction,
          opportunityHref: (opportunityId) => `/agent/opportunities/${opportunityId}`,
        }}
      />
    </div>
  );
}
