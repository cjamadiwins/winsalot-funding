import { requireLeadgenAdmin } from "@/lib/leadgen-auth";
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

export default async function LeadgenAdminDoNotContactPage() {
  await requireLeadgenAdmin();
  const rows = await getAllDncSuppressions();

  return (
    <DoNotContactAdminClient
      rows={rows}
      crmLabel="Lead Generation CRM"
      exportHref="/leadgen/admin/do-not-contact/export"
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
