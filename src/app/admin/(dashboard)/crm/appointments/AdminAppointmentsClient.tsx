"use client";

import WinsalotAppointmentsListClient, { type WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import { cancelAppointmentAction, deleteAppointmentAction, editAppointmentAction, getOfferedSlotsAction, rescheduleAppointmentAction } from "./actions";

export default function AdminAppointmentsClient({ appointments }: { appointments: WinsalotAppointmentListRow[] }) {
  return (
    <WinsalotAppointmentsListClient
      appointments={appointments}
      isAdmin
      actions={{
        getOfferedSlots: getOfferedSlotsAction,
        reschedule: rescheduleAppointmentAction,
        cancel: cancelAppointmentAction,
        edit: editAppointmentAction,
        remove: deleteAppointmentAction,
        opportunityHref: (opportunityId) => `/admin/crm/opportunities/${opportunityId}`,
      }}
    />
  );
}
