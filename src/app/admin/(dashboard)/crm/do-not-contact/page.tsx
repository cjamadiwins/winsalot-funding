import { requireCrmAdmin } from "@/lib/crm-auth";
import { getAllDncSuppressions } from "@/lib/dnc-suppression";
import DoNotContactAdminClient from "@/components/crm-ui/DoNotContactAdminClient";
import {
  addSuppressionAction,
  editSuppressionAction,
  getAuditLogAction,
  importDncCsvAction,
  reactivateSuppressionAction,
  removeSuppressionAction,
} from "./actions";

export default async function AdminDoNotContactPage() {
  await requireCrmAdmin();
  const rows = await getAllDncSuppressions();

  return (
    <DoNotContactAdminClient
      rows={rows}
      crmLabel="Growth CRM"
      exportHref="/admin/crm/do-not-contact/export"
      actions={{
        addSuppression: addSuppressionAction,
        removeSuppression: removeSuppressionAction,
        reactivateSuppression: reactivateSuppressionAction,
        editSuppression: editSuppressionAction,
        importCsv: importDncCsvAction,
        getAuditLog: getAuditLogAction,
      }}
    />
  );
}
