"use client";

import WinsalotAppointmentsListClient, { type WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import { cancelAppointmentAction, editAppointmentAction, getOfferedSlotsAction, rescheduleAppointmentAction } from "./actions";

export default function AgentAppointmentsClient({ appointments }: { appointments: WinsalotAppointmentListRow[] }) {
  return (
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
  );
}
