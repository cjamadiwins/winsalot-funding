"use client";

import WinsalotAppointmentsListClient, { type WinsalotAppointmentListRow } from "@/components/WinsalotAppointmentsListClient";
import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  editAppointmentAction,
  getOfferedSlotsAction,
  rescheduleAppointmentAction,
  reviewCrmAppointmentIncentiveAction,
} from "./actions";

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
        reviewIncentive: reviewCrmAppointmentIncentiveAction,
        opportunityHref: (opportunityId) => `/admin/crm/opportunities/${opportunityId}`,
      }}
    />
  );
}
